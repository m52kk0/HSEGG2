/**
 * Прокси к открытому API «Работа России» (trudvsem.ru).
 *
 * hh.ru закрыл публичный поиск вакансий для неавторизованных клиентов,
 * поэтому источник — «Работа России»: ключ не нужен, лицензия открытая.
 *
 * Эндпоинт никогда не отдаёт 5xx из-за внешнего API: при ошибке или таймауте
 * возвращается последний кэш, а если и его нет — снимок из репозитория.
 */
import vacanciesSample from '../../../data/snapshot/vacancies_sample_nn.json';
import { SNAPSHOT_DATE } from '@cursus/data';
import type { Store } from './db';

export type VacanciesSource = 'live' | 'cache' | 'snapshot';

export interface VacancyItem {
  title: string;
  company: string;
  salaryMin: number | null;
  salaryMax: number | null;
  url: string;
}

export interface VacanciesResult {
  source: VacanciesSource;
  fetchedAt: string;
  total: number;
  items: VacancyItem[];
}

interface RawVacancy {
  'job-name'?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  company?: { name?: string };
  vac_url?: string;
}

interface RawResponse {
  meta?: { total?: number };
  results?: { vacancies?: { vacancy?: RawVacancy }[] };
}

const API_BASE = 'http://opendata.trudvsem.ru/api/v1/vacancies';

function normalize(raw: RawResponse): { total: number; items: VacancyItem[] } {
  const list = raw.results?.vacancies ?? [];
  const items: VacancyItem[] = [];

  for (const entry of list) {
    const vacancy = entry.vacancy;
    if (!vacancy) continue;
    items.push({
      title: vacancy['job-name']?.trim() ?? 'Без названия',
      company: vacancy.company?.name?.trim() ?? 'Работодатель не указан',
      salaryMin: typeof vacancy.salary_min === 'number' ? vacancy.salary_min : null,
      salaryMax: typeof vacancy.salary_max === 'number' ? vacancy.salary_max : null,
      url: vacancy.vac_url ?? 'https://trudvsem.ru/',
    });
  }

  return { total: raw.meta?.total ?? items.length, items };
}

/** Снимок-фолбэк: пример ответа по Нижегородской области из data/snapshot. */
function snapshotResult(): VacanciesResult {
  const normalized = normalize(vacanciesSample as RawResponse);
  return {
    source: 'snapshot',
    fetchedAt: `${SNAPSHOT_DATE}T00:00:00.000Z`,
    total: normalized.total,
    items: normalized.items,
  };
}

interface LruEntry {
  value: VacanciesResult;
  expiresAt: number;
}

/** Небольшой LRU в памяти поверх кэша в SQLite — чтобы не ходить в базу на каждый клик. */
class Lru {
  private readonly map = new Map<string, LruEntry>();

  constructor(private readonly limit = 100) {}

  get(key: string): VacanciesResult | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    // Освежаем позицию: Map хранит порядок вставки.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: VacanciesResult, ttlMs: number): void {
    if (this.map.size >= this.limit) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}

export interface VacanciesDeps {
  store: Store | null;
  timeoutMs: number;
  cacheTtlH: number;
  /** Подменяется в тестах. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface VacanciesQuery {
  query: string;
  /** 13-значный код региона для API «Работа России». */
  regionCode: string | null;
  limit?: number;
}

export function createVacanciesService(deps: VacanciesDeps) {
  const lru = new Lru();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.cacheTtlH * 60 * 60 * 1000;

  function buildUrl({ query, regionCode, limit = 20 }: VacanciesQuery): string {
    const path = regionCode ? `${API_BASE}/region/${regionCode}` : API_BASE;
    const params = new URLSearchParams({ text: query, limit: String(limit) });
    return `${path}?${params.toString()}`;
  }

  async function load(query: VacanciesQuery): Promise<VacanciesResult> {
    const key = `${query.regionCode ?? 'RU'}|${query.query.toLowerCase()}`;

    const fromLru = lru.get(key);
    if (fromLru) return { ...fromLru, source: 'cache' };

    const fromDb = deps.store?.readCache(key) ?? null;
    if (fromDb && now() - fromDb.fetchedAt < ttlMs) {
      const value = JSON.parse(fromDb.payload) as VacanciesResult;
      lru.set(key, value, ttlMs);
      return { ...value, source: 'cache' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

    try {
      const response = await fetchImpl(buildUrl(query), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`trudvsem responded ${response.status}`);

      const normalized = normalize((await response.json()) as RawResponse);
      const fetchedAt = now();
      const result: VacanciesResult = {
        source: 'live',
        fetchedAt: new Date(fetchedAt).toISOString(),
        total: normalized.total,
        items: normalized.items,
      };

      lru.set(key, result, ttlMs);
      deps.store?.writeCache(key, JSON.stringify(result), fetchedAt);
      return result;
    } catch {
      // Внешнее API упало или не ответило за таймаут: отдаём просроченный кэш,
      // а если его нет — снимок. Пользователь видит дату данных, а не ошибку.
      if (fromDb) {
        const value = JSON.parse(fromDb.payload) as VacanciesResult;
        return { ...value, source: 'cache' };
      }
      return snapshotResult();
    } finally {
      clearTimeout(timer);
    }
  }

  return { load, buildUrl, clearMemory: () => lru.clear() };
}

export { snapshotResult };
