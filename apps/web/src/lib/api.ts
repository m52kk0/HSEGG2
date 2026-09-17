/** Обращения к /api. Любая ошибка возвращает null: сценарий работает и без бэкенда. */

export interface VacancyItem {
  title: string;
  company: string;
  salaryMin: number | null;
  salaryMax: number | null;
  url: string;
}

export interface VacanciesResponse {
  source: 'live' | 'cache' | 'snapshot';
  fetchedAt: string;
  total: number;
  items: VacancyItem[];
}

async function getJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export function fetchVacancies(
  query: string,
  regionCode: string | null,
): Promise<VacanciesResponse | null> {
  const params = new URLSearchParams({ q: query });
  if (regionCode) params.set('region', regionCode);
  return getJson<VacanciesResponse>(`/api/vacancies?${params.toString()}`);
}

export interface AdminStats {
  funnel: { name: string; count: number; conversion: number | null }[];
  actions: { name: string; count: number }[];
  topCodes: { code: string; count: number }[];
  topPairs: { codes: string; count: number }[];
  verdicts: { verdict: string; count: number }[];
  sessions: number;
  demoMode: boolean;
  synthetic: number;
}

export function fetchAdminStats(
  period: string,
  token: string | null,
  includeSynthetic: boolean,
): Promise<AdminStats | null> {
  const params = new URLSearchParams({ period, synthetic: includeSynthetic ? '1' : '0' });
  const url = `/api/admin/stats?${params.toString()}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  return fetch(url, {
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
    .then((r) => (r.ok ? (r.json() as Promise<AdminStats>) : null))
    .catch(() => null)
    .finally(() => window.clearTimeout(timer));
}

export function seedDemoEvents(): Promise<boolean> {
  return fetch('/api/admin/seed', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false);
}
