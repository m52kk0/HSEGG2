/**
 * Приём событий, rate-limit и агрегаты для /admin.
 * Отдельно проверяем, что в базу не попадает ничего, похожего на персональные
 * данные: схема пропускает только известные события и примитивные свойства.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RateLimiter, buildStats, periodStart, seedSyntheticEvents } from '../analytics';
import { openStore, type Store } from '../db';
import { harness, type Harness } from './helpers';

let current: Harness | null = null;
let stores: Store[] = [];

function memoryStore(): Store {
  const store = openStore(':memory:');
  stores.push(store);
  return store;
}

function app(patch: Parameters<typeof harness>[0] = {}) {
  current?.close();
  current = harness(patch);
  return current;
}

const post = (h: Harness, body: unknown) =>
  h.app.request('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

afterEach(() => {
  current?.close();
  current = null;
  for (const store of stores) store.close();
  stores = [];
});

describe('POST /api/events', () => {
  it('принимает батч и сохраняет его', async () => {
    const h = app();
    const response = await post(h, {
      sessionId: 'session-1234',
      events: [
        { name: 'onboarding_start' },
        { name: 'onboarding_step', props: { step: 2 } },
        { name: 'plan_view', props: { verdict: 'good', universities: 5, hasSafe: true } },
      ],
    });

    expect(response.status).toBe(202);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      accepted: 3,
      stored: true,
    });

    const counts = h.store.countByEvent(0, false);
    expect(counts.get('plan_view')).toBe(1);
  });

  it('незнакомое событие — 400', async () => {
    const response = await post(app(), {
      sessionId: 'session-1234',
      events: [{ name: 'украсть_данные' }],
    });
    expect(response.status).toBe(400);
  });

  it('больше 50 событий — 400', async () => {
    const response = await post(app(), {
      sessionId: 'session-1234',
      events: Array.from({ length: 51 }, () => ({ name: 'plan_view' })),
    });
    expect(response.status).toBe(400);
  });

  it('пустой батч — 400', async () => {
    expect((await post(app(), { sessionId: 'session-1234', events: [] })).status).toBe(400);
  });

  it('короткий sessionId — 400', async () => {
    expect((await post(app(), { sessionId: 'x', events: [{ name: 'plan_view' }] })).status).toBe(
      400,
    );
  });

  it('вложенный объект в props — 400: сюда можно только примитивы', async () => {
    const response = await post(app(), {
      sessionId: 'session-1234',
      events: [{ name: 'plan_view', props: { user: { email: 'a@b.c' } } }],
    });
    expect(response.status).toBe(400);
  });

  it('не JSON — 400', async () => {
    const h = app();
    const response = await h.app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'мусор',
    });
    expect(response.status).toBe(400);
  });

  it('без хранилища принимает событие, но не сохраняет', async () => {
    const h = app({ store: null });
    const response = await post(h, { sessionId: 'session-1234', events: [{ name: 'plan_view' }] });
    expect(response.status).toBe(202);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      accepted: 1,
      stored: false,
    });
  });

  it('клиентское время из будущего заменяется серверным', async () => {
    const h = app({ now: () => 1_000_000 });
    await post(h, {
      sessionId: 'session-1234',
      events: [{ name: 'plan_view', ts: 9_999_999_999 }],
    });
    // Событие попало в период, значит время не из будущего.
    expect(h.store.countSessions(999_999, false)).toBe(1);
  });

  it('rate-limit: 61-й запрос в минуту — 429', async () => {
    const h = app();
    for (let i = 0; i < 60; i += 1) {
      const response = await post(h, {
        sessionId: 'session-flood',
        events: [{ name: 'plan_view' }],
      });
      expect(response.status).toBe(202);
    }
    expect((await post(h, { sessionId: 'session-flood', events: [{ name: 'plan_view' }] })).status).toBe(
      429,
    );
  });

  it('лимит считается по сессии, а не глобально', async () => {
    const h = app();
    for (let i = 0; i < 60; i += 1) {
      await post(h, { sessionId: 'session-flood', events: [{ name: 'plan_view' }] });
    }
    expect((await post(h, { sessionId: 'session-other', events: [{ name: 'plan_view' }] })).status).toBe(
      202,
    );
  });
});

describe('RateLimiter', () => {
  it('окно скользящее: через минуту запросы снова проходят', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 100)).toBe(true);
    expect(limiter.allow('a', 200)).toBe(false);
    expect(limiter.allow('a', 1500)).toBe(true);
  });
});

describe('periodStart', () => {
  it('считает границы периодов', () => {
    const now = 10_000_000_000;
    expect(periodStart('24h', now)).toBe(now - 86_400_000);
    expect(periodStart('7d', now)).toBe(now - 604_800_000);
    expect(periodStart('all', now)).toBe(0);
  });
});

describe('GET /api/admin/stats', () => {
  it('в демо-режиме открыт без токена и помечает это', async () => {
    const response = await app().app.request('/api/admin/stats');
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).demoMode).toBe(true);
  });

  it('с заданным ADMIN_TOKEN без заголовка — 401', async () => {
    const h = app({ config: { adminToken: 's3cret-token' } });
    expect((await h.app.request('/api/admin/stats')).status).toBe(401);
  });

  it('с неверным токеном — 401', async () => {
    const h = app({ config: { adminToken: 's3cret-token' } });
    const response = await h.app.request('/api/admin/stats', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(response.status).toBe(401);
  });

  it('с верным токеном — 200', async () => {
    const h = app({ config: { adminToken: 's3cret-token' } });
    const response = await h.app.request('/api/admin/stats', {
      headers: { Authorization: 'Bearer s3cret-token' },
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).demoMode).toBe(false);
  });

  it('кривой период — 400', async () => {
    expect((await app().app.request('/api/admin/stats?period=навсегда')).status).toBe(400);
  });

  it('строит воронку по пройденному сценарию', async () => {
    const h = app();
    await post(h, {
      sessionId: 'session-real',
      events: [
        { name: 'onboarding_start' },
        { name: 'onboarding_complete', props: { scoreBucket: '200-239' } },
        { name: 'plan_view', props: { verdict: 'good' } },
        { name: 'program_open', props: { code: '15.03.04', zone: 'target' } },
        { name: 'compare_open', props: { codes: '13.03.02|15.03.04', count: 2 } },
      ],
    });

    const body = (await (await h.app.request('/api/admin/stats?period=all')).json()) as Record<
      string,
      any
    >;

    expect(body.funnel[0]).toEqual({ name: 'Открыл онбординг', count: 1, conversion: null });
    expect(body.funnel[1].count).toBe(1);
    expect(body.funnel[1].conversion).toBe(100);
    expect(body.topCodes).toEqual([{ code: '15.03.04', count: 1 }]);
    expect(body.topPairs).toEqual([{ codes: '13.03.02|15.03.04', count: 1 }]);
    expect(body.verdicts).toEqual([{ verdict: 'good', count: 1 }]);
    expect(body.sessions).toBe(1);
  });

  it('фильтр synthetic=0 убирает синтетические сессии', async () => {
    const h = app();
    seedSyntheticEvents(h.store, 20);
    await post(h, { sessionId: 'session-real', events: [{ name: 'onboarding_start' }] });

    const withSynthetic = (await (
      await h.app.request('/api/admin/stats?period=all&synthetic=1')
    ).json()) as Record<string, any>;
    const withoutSynthetic = (await (
      await h.app.request('/api/admin/stats?period=all&synthetic=0')
    ).json()) as Record<string, any>;

    expect(withSynthetic.sessions).toBeGreaterThan(1);
    expect(withoutSynthetic.sessions).toBe(1);
    expect(withSynthetic.synthetic).toBeGreaterThan(0);
  });

  it('без хранилища показывает нули, а не ошибку', async () => {
    const h = app({ store: null });
    const response = await h.app.request('/api/admin/stats');
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, any>).sessions).toBe(0);
  });
});

describe('POST /api/admin/seed', () => {
  it('в демо-режиме создаёт синтетические события', async () => {
    const h = app();
    const response = await h.app.request('/api/admin/seed', { method: 'POST' });
    expect(response.status).toBe(201);

    const body = (await response.json()) as Record<string, number>;
    expect(body.sessions).toBe(500);
    expect(body.created).toBeGreaterThan(1000);
  });

  it('повторный сид не накапливает дубликаты', async () => {
    const h = app();
    await h.app.request('/api/admin/seed', { method: 'POST' });
    const first = h.store.countSessions(0, true);
    await h.app.request('/api/admin/seed', { method: 'POST' });
    expect(h.store.countSessions(0, true)).toBe(first);
  });

  it('с заданным ADMIN_TOKEN сид запрещён', async () => {
    const h = app({ config: { adminToken: 's3cret-token' } });
    expect((await h.app.request('/api/admin/seed', { method: 'POST' })).status).toBe(403);
  });
});

describe('seedSyntheticEvents', () => {
  it('детерминирован и помечает всё синтетикой', () => {
    const a = memoryStore();
    const b = memoryStore();
    const countA = seedSyntheticEvents(a, 50, 1_000_000);
    const countB = seedSyntheticEvents(b, 50, 1_000_000);

    expect(countA).toBe(countB);
    expect(a.countSessions(0, false)).toBe(0);
    expect(a.countSessions(0, true)).toBeGreaterThan(30);
  });

  it('воронка синтетики убывает — как у настоящих пользователей', () => {
    const store = memoryStore();
    seedSyntheticEvents(store, 300, 1_000_000_000);
    const stats = buildStats(store, 'all', true, true, 1_000_000_000);

    const counts = stats.funnel.map((s) => s.count);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
    expect(counts[0]).toBeGreaterThan(100);
  });
});

describe('воронка вложенная', () => {
  it('сессия, вошедшая по ссылке «Поделиться», не даёт конверсию больше 100%', async () => {
    const h = app();

    // Полный путь.
    await post(h, {
      sessionId: 'session-full',
      events: [
        { name: 'onboarding_start' },
        { name: 'onboarding_complete' },
        { name: 'plan_view' },
      ],
    });

    // Вход по ссылке: план увидел, онбординг не проходил.
    await post(h, { sessionId: 'session-shared', events: [{ name: 'plan_view' }] });

    const body = (await (await h.app.request('/api/admin/stats?period=all')).json()) as Record<
      string,
      any
    >;

    expect(body.funnel[1].count).toBe(1);
    expect(body.funnel[2].count).toBe(1);
    for (const step of body.funnel) {
      if (step.conversion === null) continue;
      expect(step.conversion, step.name).toBeLessThanOrEqual(100);
    }
  });

  it('шаг без предыдущего не попадает в воронку', async () => {
    const h = app();
    await post(h, {
      sessionId: 'session-jump',
      events: [{ name: 'compare_open', props: { codes: 'a|b' } }],
    });

    const body = (await (await h.app.request('/api/admin/stats?period=all')).json()) as Record<
      string,
      any
    >;
    expect(body.funnel.find((s: any) => s.name === 'Сравнил направления').count).toBe(0);
    // Само событие при этом видно в топах — данные не теряются.
    expect(body.topPairs).toHaveLength(1);
  });

  it('на синтетике воронка монотонно убывает', async () => {
    const h = app();
    seedSyntheticEvents(h.store, 200, 1_000_000_000);

    const body = (await (
      await h.app.request('/api/admin/stats?period=all&synthetic=1')
    ).json()) as Record<string, any>;

    const counts = body.funnel.map((s: any) => s.count as number);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });
});
