/**
 * Hono-приложение. Собирается фабрикой, чтобы тесты могли поднять его
 * с базой в памяти и подменённым fetch через app.request().
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import {
  CAMPAIGN_DATES,
  CAMPAIGN_RULES_NOTE,
  CAMPAIGN_YEAR,
  INTEREST_GROUPS,
  LIMITS,
  SUBJECT_LABELS,
  TREND_CLAMP,
  ZONE_LABELS,
  ZONE_THRESHOLDS,
  buildPlan,
  type UserProfile,
} from '@cursus/core';
import {
  SALARIES_NOTE,
  SALARIES_SOURCE,
  SNAPSHOT_DATE,
  directions,
  filterPrograms,
  getContent,
  getProgram,
  getSalaries,
  getUniversity,
  programs,
  regions,
  searchDirections,
  snapshotStats,
  universities,
  universitiesOfRegion,
} from '@cursus/data';
import { buildStats, RateLimiter, seedSyntheticEvents } from './analytics';
import { isDemoMode, type Config } from './config';
import type { Store } from './db';
import { buildOpenApi } from './openapi';
import {
  eventsBodySchema,
  periodSchema,
  planBodySchema,
  programsQuerySchema,
  vacanciesQuerySchema,
} from './schemas';
import { createVacanciesService } from './vacancies';

export interface AppDeps {
  config: Config;
  store: Store | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  startedAt?: number;
}

/** Ответ об ошибке всегда одинаковой формы: клиенту проще, отладке понятнее. */
function fail(message: string, details?: unknown) {
  return { error: message, ...(details === undefined ? {} : { details }) };
}

export function createApp(deps: AppDeps) {
  const { config, store } = deps;
  const startedAt = deps.startedAt ?? Date.now();
  const now = deps.now ?? (() => Date.now());
  const demoMode = isDemoMode(config);

  const vacancies = createVacanciesService({
    store,
    timeoutMs: config.vacanciesTimeoutMs,
    cacheTtlH: config.vacanciesCacheTtlH,
    fetchImpl: deps.fetchImpl,
    now,
  });

  const limiter = new RateLimiter();
  const app = new Hono();

  // Фронт и API живут на одном origin, но CORS не мешает локальной разработке.
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

  /* ------------------------------------------------------------ Служебное */

  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      version: config.version,
      snapshotDate: SNAPSHOT_DATE,
      uptime: Math.round((now() - startedAt) / 1000),
    }),
  );

  app.get('/api/meta', (c) =>
    c.json({
      campaignYear: CAMPAIGN_YEAR,
      rulesNote: CAMPAIGN_RULES_NOTE,
      dates: CAMPAIGN_DATES,
      limits: LIMITS,
      zones: {
        thresholds: ZONE_THRESHOLDS,
        labels: ZONE_LABELS,
        trendClamp: TREND_CLAMP,
      },
      interests: INTEREST_GROUPS,
      subjects: SUBJECT_LABELS,
      snapshot: snapshotStats,
      sources: { salaries: SALARIES_SOURCE, salariesNote: SALARIES_NOTE },
    }),
  );

  app.get('/api/openapi.json', (c) => c.json(buildOpenApi(config.version, SNAPSHOT_DATE)));

  /* -------------------------------------------------------------- Каталог */

  app.get('/api/regions', (c) => c.json({ items: regions }));

  app.get('/api/directions', (c) => {
    const query = c.req.query('q')?.trim() ?? '';
    const limitRaw = Number(c.req.query('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 50;
    const items = query.length > 0 ? searchDirections(query, limit) : directions.slice(0, limit);
    return c.json({ total: query.length > 0 ? items.length : directions.length, items });
  });

  app.get('/api/universities', (c) => {
    const region = c.req.query('region');
    const items = region ? universitiesOfRegion(region) : universities;
    return c.json({ total: items.length, items });
  });

  app.get('/api/programs', (c) => {
    const parsed = programsQuerySchema.safeParse({
      region: c.req.query('region'),
      code: c.req.query('code'),
      universityId: c.req.query('universityId'),
      limit: c.req.query('limit') ?? undefined,
    });
    if (!parsed.success) return c.json(fail('Некорректные параметры', parsed.error.format()), 400);

    const { region, code, universityId, limit } = parsed.data;
    // Короткий код — это префикс: «15» или «15.03» тоже должны работать.
    const exact = code && code.length === 8 ? code : null;
    let items = filterPrograms({
      region: region ?? null,
      code: exact,
      universityId: universityId ?? null,
    });
    if (code && !exact) items = items.filter((p) => p.code.startsWith(code));

    return c.json({ total: items.length, items: items.slice(0, limit) });
  });

  app.get('/api/programs/:id', (c) => {
    const program = getProgram(c.req.param('id'));
    if (!program) return c.json(fail('Направление не найдено'), 404);

    const university = getUniversity(program.universityId);
    const salaries = getSalaries(program.code, university?.region ?? null);

    return c.json({
      program,
      university,
      content: getContent(program.code),
      salaries: {
        ...salaries,
        source: SALARIES_SOURCE,
        fallbackNote: salaries.fallbackToRussia ? 'по России' : null,
      },
    });
  });

  app.get('/api/salaries/:code', (c) => {
    const code = c.req.param('code');
    const region = c.req.query('region') ?? null;
    const salaries = getSalaries(code, region);
    if (!salaries.entry) return c.json(fail('Нет данных по этому направлению'), 404);

    return c.json({
      code,
      region,
      ...salaries,
      source: SALARIES_SOURCE,
      note: SALARIES_NOTE,
    });
  });

  /* ------------------------------------------------------------- Вакансии */

  app.get('/api/vacancies', async (c) => {
    const parsed = vacanciesQuerySchema.safeParse({
      q: c.req.query('q'),
      region: c.req.query('region'),
    });
    if (!parsed.success) return c.json(fail('Некорректные параметры', parsed.error.format()), 400);

    // Внешнее API уже обёрнуто фолбэками, но страховка от неожиданного всё равно нужна:
    // этот эндпоинт не имеет права отдать 5xx.
    try {
      const result = await vacancies.load({
        query: parsed.data.q,
        regionCode: parsed.data.region ?? null,
      });
      return c.json(result);
    } catch {
      return c.json({ source: 'snapshot', fetchedAt: SNAPSHOT_DATE, total: 0, items: [] });
    }
  });

  /* ----------------------------------------------------------------- План */

  app.post('/api/plan', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(fail('Ожидается JSON'), 400);
    }

    const parsed = planBodySchema.safeParse(body);
    if (!parsed.success) return c.json(fail('Некорректный профиль', parsed.error.format()), 400);

    // Та же функция, что и в браузере: расхождений между клиентом и сервером нет.
    const profile: UserProfile = parsed.data;
    const plan = buildPlan(profile, programs, universities);

    return c.json({
      verdict: plan.verdict,
      warnings: plan.warnings,
      simulation: plan.simulation,
      universities: plan.universities.map((u) => ({
        university: u.university,
        likelyAdmission: u.likelyAdmission,
        programs: u.programs.map((p) => ({
          priority: p.priority,
          zone: p.zone,
          margin: p.margin,
          predictedCutoff: p.forecast.predictedCutoff,
          score: p.score.total,
          program: p.program,
        })),
      })),
    });
  });

  /* ------------------------------------------------------------ Аналитика */

  app.post('/api/events', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(fail('Ожидается JSON'), 400);
    }

    const parsed = eventsBodySchema.safeParse(body);
    if (!parsed.success) return c.json(fail('Некорректное тело', parsed.error.format()), 400);

    if (!limiter.allow(parsed.data.sessionId, now())) {
      return c.json(fail('Слишком много запросов'), 429);
    }

    if (!store) return c.json({ accepted: 0, stored: false }, 202);

    const timestamp = now();
    store.insertEvents(
      parsed.data.events.map((event) => ({
        sessionId: parsed.data.sessionId,
        name: event.name,
        props: event.props ?? {},
        // Клиентское время не доверяем как истине, но сохраняем порядок событий.
        createdAt: event.ts && event.ts > 0 && event.ts <= timestamp ? event.ts : timestamp,
        synthetic: false,
      })),
    );

    return c.json({ accepted: parsed.data.events.length, stored: true }, 202);
  });

  app.get('/api/admin/stats', (c) => {
    if (!demoMode) {
      const header = c.req.header('Authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token !== config.adminToken) return c.json(fail('Нужен ADMIN_TOKEN'), 401);
    }

    const period = periodSchema.safeParse(c.req.query('period') ?? undefined);
    if (!period.success) return c.json(fail('Период: 24h, 7d или all'), 400);

    if (!store) {
      return c.json(
        buildStats(emptyStore, period.data, true, demoMode, now()),
      );
    }

    const includeSynthetic = (c.req.query('synthetic') ?? '1') !== '0';
    return c.json(buildStats(store, period.data, includeSynthetic, demoMode, now()));
  });

  app.post('/api/admin/seed', (c) => {
    if (!demoMode) return c.json(fail('Сид доступен только в демо-режиме'), 403);
    if (!store) return c.json(fail('Хранилище недоступно'), 503);

    store.clearSynthetic();
    const created = seedSyntheticEvents(store, 500, now());
    return c.json({ created, sessions: 500 }, 201);
  });

  app.notFound((c) =>
    c.req.path.startsWith('/api/') ? c.json(fail('Такого эндпоинта нет'), 404) : c.text('', 404),
  );

  app.onError((error, c) => {
    console.error('[api]', error);
    return c.json(fail('Внутренняя ошибка'), 500);
  });

  return app;
}

/** Заглушка хранилища: экран аналитики показывает нули, а не ошибку. */
const emptyStore: Store = {
  insertEvents: () => undefined,
  countSessions: () => 0,
  countSynthetic: () => 0,
  countByEvent: () => new Map(),
  sessionsByEvent: () => new Map(),
  topProps: () => [],
  clearSynthetic: () => undefined,
  readCache: () => null,
  writeCache: () => undefined,
  close: () => undefined,
};

export type App = ReturnType<typeof createApp>;
export { z };
