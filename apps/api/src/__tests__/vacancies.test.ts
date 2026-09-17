/**
 * Прокси вакансий. Главное требование ТЗ: эндпоинт никогда не отдаёт 5xx
 * из-за внешнего API. Проверяем всю цепочку деградации:
 * живые данные -> кэш -> снимок.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVacanciesService } from '../vacancies';
import { openStore, type Store } from '../db';
import {
  failingFetch,
  hangingFetch,
  harness,
  okFetch,
  throwingFetch,
  trudvsemResponse,
  type Harness,
} from './helpers';

let stores: Store[] = [];
let current: Harness | null = null;

function store(): Store {
  const s = openStore(':memory:');
  stores.push(s);
  return s;
}

afterEach(() => {
  for (const s of stores) s.close();
  stores = [];
  current?.close();
  current = null;
  vi.useRealTimers();
});

describe('нормализация ответа «Работы России»', () => {
  it('приводит вакансии к своему формату', async () => {
    const service = createVacanciesService({
      store: null,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: okFetch(trudvsemResponse(2, 17)),
    });

    const result = await service.load({ query: 'инженер АСУ ТП', regionCode: '5200000000000' });
    expect(result.source).toBe('live');
    expect(result.total).toBe(17);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      title: 'Инженер АСУ ТП 1',
      company: 'АО «Завод 1»',
      salaryMin: 70000,
      salaryMax: 90000,
      url: 'https://trudvsem.ru/vacancy/card/1',
    });
  });

  it('терпит пустые поля вакансии', async () => {
    const service = createVacanciesService({
      store: null,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: okFetch({ results: { vacancies: [{ vacancy: {} }, {}] } }),
    });

    const result = await service.load({ query: 'что-то', regionCode: null });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'Без названия',
      company: 'Работодатель не указан',
      salaryMin: null,
    });
  });

  it('URL собирается с регионом и без него', () => {
    const service = createVacanciesService({ store: null, timeoutMs: 1000, cacheTtlH: 6 });

    expect(service.buildUrl({ query: 'инженер', regionCode: '5200000000000' })).toBe(
      'http://opendata.trudvsem.ru/api/v1/vacancies/region/5200000000000?text=%D0%B8%D0%BD%D0%B6%D0%B5%D0%BD%D0%B5%D1%80&limit=20',
    );
    expect(service.buildUrl({ query: 'x', regionCode: null })).toContain('/api/v1/vacancies?text=x');
  });
});

describe('кэш', () => {
  it('второй запрос не ходит в сеть', async () => {
    const fetchSpy = vi.fn(okFetch(trudvsemResponse(1)));
    const service = createVacanciesService({
      store: store(),
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const first = await service.load({ query: 'инженер', regionCode: null });
    const second = await service.load({ query: 'инженер', regionCode: null });

    expect(first.source).toBe('live');
    expect(second.source).toBe('cache');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('кэш в базе переживает перезапуск процесса', async () => {
    const shared = store();
    const fetchSpy = vi.fn(okFetch(trudvsemResponse(1)));

    const first = createVacanciesService({
      store: shared,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await first.load({ query: 'инженер', regionCode: null });

    // Новый сервис = новый процесс: память пуста, но база та же.
    const second = createVacanciesService({
      store: shared,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const result = await second.load({ query: 'инженер', regionCode: null });

    expect(result.source).toBe('cache');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('просроченный кэш обновляется из сети', async () => {
    const shared = store();
    let time = 1_000_000;
    const fetchSpy = vi.fn(okFetch(trudvsemResponse(1)));
    const make = () =>
      createVacanciesService({
        store: shared,
        timeoutMs: 1000,
        cacheTtlH: 6,
        fetchImpl: fetchSpy as unknown as typeof fetch,
        now: () => time,
      });

    await make().load({ query: 'инженер', regionCode: null });
    // Прошло 7 часов при TTL 6.
    time += 7 * 60 * 60 * 1000;
    const result = await make().load({ query: 'инженер', regionCode: null });

    expect(result.source).toBe('live');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('разные запросы кэшируются отдельно', async () => {
    const fetchSpy = vi.fn(okFetch(trudvsemResponse(1)));
    const service = createVacanciesService({
      store: store(),
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await service.load({ query: 'инженер', regionCode: null });
    await service.load({ query: 'врач', regionCode: null });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('деградация вместо ошибки', () => {
  it('таймаут при наличии кэша отдаёт кэш', async () => {
    const shared = store();
    await createVacanciesService({
      store: shared,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: okFetch(trudvsemResponse(3, 42)),
    }).load({ query: 'инженер', regionCode: null });

    let time = 1_000_000;
    const later = createVacanciesService({
      store: shared,
      timeoutMs: 20,
      cacheTtlH: 6,
      fetchImpl: hangingFetch(),
      // Сдвигаем время так, чтобы кэш считался просроченным и сервис пошёл в сеть.
      now: () => (time += 10 * 60 * 60 * 1000),
    });

    const result = await later.load({ query: 'инженер', regionCode: null });
    expect(result.source).toBe('cache');
    expect(result.total).toBe(42);
  });

  it('ошибка без кэша отдаёт снимок из репозитория', async () => {
    const service = createVacanciesService({
      store: null,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: failingFetch(500),
    });

    const result = await service.load({ query: 'инженер АСУ ТП', regionCode: '5200000000000' });
    expect(result.source).toBe('snapshot');
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.fetchedAt).toContain('2026-09-17');
  });

  it('обрыв сети без кэша тоже отдаёт снимок', async () => {
    const service = createVacanciesService({
      store: null,
      timeoutMs: 1000,
      cacheTtlH: 6,
      fetchImpl: throwingFetch(),
    });
    expect((await service.load({ query: 'x', regionCode: null })).source).toBe('snapshot');
  });

  it('таймаут без кэша отдаёт снимок', async () => {
    const service = createVacanciesService({
      store: null,
      timeoutMs: 20,
      cacheTtlH: 6,
      fetchImpl: hangingFetch(),
    });
    expect((await service.load({ query: 'x', regionCode: null })).source).toBe('snapshot');
  });
});

describe('GET /api/vacancies', () => {
  function app(fetchImpl?: typeof fetch) {
    current?.close();
    current = harness(fetchImpl ? { fetchImpl } : {});
    return current.app;
  }

  it('отдаёт живые данные', async () => {
    const response = await app(okFetch(trudvsemResponse(2))).request(
      '/api/vacancies?q=инженер АСУ ТП&region=5200000000000',
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    expect(body.source).toBe('live');
    expect(body.items).toHaveLength(2);
  });

  it('при падении внешнего API отвечает 200 и снимком, а не 5xx', async () => {
    const response = await app(failingFetch(502)).request('/api/vacancies?q=инженер');
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).source).toBe('snapshot');
  });

  it('при таймауте отвечает 200', async () => {
    current?.close();
    current = harness({ fetchImpl: hangingFetch(), config: { vacanciesTimeoutMs: 20 } });
    const response = await current.app.request('/api/vacancies?q=инженер');
    expect(response.status).toBe(200);
  });

  it('без запроса — 400', async () => {
    expect((await app().request('/api/vacancies')).status).toBe(400);
  });

  it('слишком короткий запрос — 400', async () => {
    expect((await app().request('/api/vacancies?q=и')).status).toBe(400);
  });

  it('кривой код региона — 400', async () => {
    expect((await app().request('/api/vacancies?q=инженер&region=52')).status).toBe(400);
  });
});
