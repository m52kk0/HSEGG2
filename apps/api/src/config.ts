/** Конфигурация из окружения. Значения по умолчанию совпадают с .env.example. */

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface Config {
  port: number;
  databasePath: string;
  /** Пусто => демо-режим: /admin открыт без пароля, доступен сид синтетики. */
  adminToken: string;
  refreshWikidata: boolean;
  vacanciesTimeoutMs: number;
  vacanciesCacheTtlH: number;
  /** Каталог со собранным фронтом; если его нет, отдаём только API. */
  webDist: string;
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 8080),
    databasePath: env.DATABASE_PATH ?? './data/cursus.db',
    adminToken: env.ADMIN_TOKEN ?? '',
    refreshWikidata: env.REFRESH_WIKIDATA === 'true',
    vacanciesTimeoutMs: num(env.VACANCIES_TIMEOUT_MS, 4000),
    vacanciesCacheTtlH: num(env.VACANCIES_CACHE_TTL_H, 6),
    webDist: env.WEB_DIST ?? './public',
    version: env.APP_VERSION ?? '1.0.0',
  };
}

/** Демо-режим — когда ADMIN_TOKEN не задан. Тогда /admin показывает баннер. */
export function isDemoMode(config: Config): boolean {
  return config.adminToken.trim().length === 0;
}
