import { afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers';

let current: Harness | null = null;

function app(patch: Parameters<typeof harness>[0] = {}) {
  current?.close();
  current = harness(patch);
  return current.app;
}

afterEach(() => {
  current?.close();
  current = null;
});

describe('GET /api/health', () => {
  it('отвечает статусом, версией и датой снимка', async () => {
    const response = await app().request('/api/health');
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.uptime).toBe('number');
  });
});

describe('GET /api/meta', () => {
  it('отдаёт даты кампании, пороги зон и лимиты правил приёма', async () => {
    const body = (await (await app().request('/api/meta')).json()) as Record<string, any>;
    expect(body.campaignYear).toBe(2026);
    expect(body.rulesNote).toBe('по правилам 2026 года');
    expect(body.zones.thresholds).toEqual({ safe: 10, target: -5 });
    expect(body.limits.maxUniversities).toBe(5);
    expect(body.limits.maxProgramsPerUniversity).toBe(5);
    expect(body.interests).toHaveLength(8);
    expect(body.snapshot.programs).toBeGreaterThan(1000);
  });
});

describe('GET /api/openapi.json', () => {
  it('валидная спецификация со всеми эндпоинтами', async () => {
    const body = (await (await app().request('/api/openapi.json')).json()) as Record<string, any>;
    expect(body.openapi).toBe('3.0.3');
    for (const path of [
      '/api/health',
      '/api/meta',
      '/api/regions',
      '/api/directions',
      '/api/universities',
      '/api/programs',
      '/api/programs/{id}',
      '/api/salaries/{code}',
      '/api/vacancies',
      '/api/plan',
      '/api/events',
      '/api/admin/stats',
      '/api/admin/seed',
    ]) {
      expect(body.paths[path], path).toBeDefined();
    }
  });

  it('тело POST /api/plan описано схемой', async () => {
    const body = (await (await app().request('/api/openapi.json')).json()) as Record<string, any>;
    const schema = body.paths['/api/plan'].post.requestBody.content['application/json'].schema;
    expect(schema.type).toBe('object');
    expect(schema.properties.scores).toBeDefined();
    expect(schema.properties.interests.type).toBe('array');
  });
});

describe('каталог', () => {
  it('регионы отдаются с кодами API «Работа России»', async () => {
    const body = (await (await app().request('/api/regions')).json()) as Record<string, any>;
    expect(body.items.length).toBeGreaterThan(80);
    expect(body.items[0].trudvsemCode).toMatch(/^\d{13}$/);
  });

  it('поиск направлений работает по коду', async () => {
    const body = (await (await app().request('/api/directions?q=15.03.04')).json()) as Record<
      string,
      any
    >;
    expect(body.items[0].code).toBe('15.03.04');
  });

  it('поиск направлений работает по названию', async () => {
    const body = (await (await app().request('/api/directions?q=автоматизация')).json()) as Record<
      string,
      any
    >;
    expect(body.items.map((d: { code: string }) => d.code)).toContain('15.03.04');
  });

  it('без запроса отдаёт начало справочника и общее число', async () => {
    const body = (await (await app().request('/api/directions?limit=5')).json()) as Record<
      string,
      any
    >;
    expect(body.items).toHaveLength(5);
    expect(body.total).toBeGreaterThan(200);
  });

  it('вузы фильтруются по региону', async () => {
    const body = (await (
      await app().request('/api/universities?region=Нижегородская область')
    ).json()) as Record<string, any>;
    expect(body.total).toBeGreaterThan(3);
    expect(
      body.items.every((u: { region: string }) => u.region === 'Нижегородская область'),
    ).toBe(true);
  });

  it('программы фильтруются по вузу и коду', async () => {
    const body = (await (
      await app().request('/api/programs?universityId=Q4318652&code=15.03.04')
    ).json()) as Record<string, any>;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].code).toBe('15.03.04');
    expect(body.items[0].isDemo).toBe(true);
  });

  it('короткий код работает как префикс', async () => {
    const body = (await (
      await app().request('/api/programs?code=13.03&region=Нижегородская область')
    ).json()) as Record<string, any>;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((p: { code: string }) => p.code.startsWith('13.03'))).toBe(true);
  });

  it('кривой код направления — 400', async () => {
    const response = await app().request('/api/programs?code=пятнадцать');
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe('Некорректные параметры');
  });

  it('кривой universityId — 400', async () => {
    expect((await app().request('/api/programs?universityId=abc')).status).toBe(400);
  });

  it('слишком большой limit — 400', async () => {
    expect((await app().request('/api/programs?limit=100000')).status).toBe(400);
  });
});

describe('GET /api/programs/:id', () => {
  it('отдаёт программу с вузом, контентом и зарплатами', async () => {
    const body = (await (
      await app().request('/api/programs/Q4318652-15.03.04')
    ).json()) as Record<string, any>;

    expect(body.program.code).toBe('15.03.04');
    expect(body.university.city).toBe('Нижний Новгород');
    expect(body.content.learn).toBeTruthy();
    expect(body.content.vacancyQuery).toBe('инженер АСУ ТП');
    expect(body.salaries.entry.y1.salary).toBeGreaterThan(10000);
    expect(body.salaries.source).toContain('tochno.st');
  });

  it('неизвестный id — 404', async () => {
    const response = await app().request('/api/programs/нет-такой');
    expect(response.status).toBe(404);
  });
});

describe('GET /api/salaries/:code', () => {
  it('отдаёт зарплаты по региону', async () => {
    const body = (await (
      await app().request('/api/salaries/09.03.01?region=Москва')
    ).json()) as Record<string, any>;
    expect(body.code).toBe('09.03.01');
    expect(body.entry.y1.salary).toBeGreaterThan(10000);
    expect(body.fallbackToRussia).toBe(false);
  });

  it('по неизвестному коду — 404, а не выдуманные числа', async () => {
    expect((await app().request('/api/salaries/99.99.99')).status).toBe(404);
  });
});

describe('POST /api/plan', () => {
  const demoProfile = {
    scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
    achievementsBonus: 2,
    interests: ['engineering', 'it', 'energy'],
    regionMode: 'home',
    homeRegion: 'Нижегородская область',
  };

  const post = (body: unknown) =>
    app().request('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('считает тот же план, что и браузер', async () => {
    const response = await post(demoProfile);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    expect(body.verdict.title).toBeTruthy();
    expect(body.universities.length).toBeGreaterThan(0);
    expect(body.universities.length).toBeLessThanOrEqual(5);

    const ngtu = body.universities.find((u: any) => u.university.wikidata === 'Q4318652');
    expect(ngtu, 'НГТУ должен попасть в план демо-профиля').toBeDefined();

    const byCode = new Map(ngtu.programs.map((p: any) => [p.program.code, p]));
    expect(['target', 'reach']).toContain((byCode.get('15.03.04') as any).zone);
    expect((byCode.get('13.03.02') as any).zone).toBe('safe');
  });

  it('приоритеты идут подряд с единицы', async () => {
    const body = (await (await post(demoProfile)).json()) as Record<string, any>;
    for (const u of body.universities) {
      expect(u.programs.map((p: any) => p.priority)).toEqual(
        u.programs.map((_: unknown, i: number) => i + 1),
      );
    }
  });

  it('пустой профиль даёт вердикт «не нашлось», а не ошибку', async () => {
    const body = (await (await post({ scores: {} })).json()) as Record<string, any>;
    expect(body.verdict.level).toBe('empty');
    expect(body.universities).toEqual([]);
  });

  it('не JSON — 400', async () => {
    const response = await app().request('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'не json',
    });
    expect(response.status).toBe(400);
  });

  it('балл вне диапазона — 400', async () => {
    expect((await post({ scores: { math: 500 } })).status).toBe(400);
  });

  it('незнакомый предмет — 400', async () => {
    expect((await post({ scores: { алхимия: 80 } })).status).toBe(400);
  });

  it('бонус больше 10 — 400: правила приёма этого не разрешают', async () => {
    expect((await post({ scores: { math: 70 }, achievementsBonus: 50 })).status).toBe(400);
  });

  it('больше трёх интересов — 400', async () => {
    const response = await post({
      scores: { math: 70 },
      interests: ['it', 'engineering', 'energy', 'medicine'],
    });
    expect(response.status).toBe(400);
  });
});

describe('несуществующие маршруты', () => {
  it('под /api отдают JSON-ошибку', async () => {
    const response = await app().request('/api/чего-то-нет');
    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toHaveProperty('error');
  });
});
