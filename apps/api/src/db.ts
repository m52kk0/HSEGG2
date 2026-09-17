/**
 * Хранилище на встроенном node:sqlite — без нативных сборок и отдельной БД-службы.
 * Две таблицы: обезличенные события аналитики и кэш ответов «Работы России».
 */
import type { DatabaseSync as DatabaseSyncCtor } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * node:sqlite берём через process.getBuiltinModule: сборщики (Vite в тестах,
 * esbuild в прод-сборке) не знают об этом модуле и пытаются искать пакет
 * «sqlite» в node_modules. Так импорт остаётся полностью рантаймовым.
 */
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncCtor;
};

export interface EventRow {
  sessionId: string;
  name: string;
  props: Record<string, string | number | boolean>;
  createdAt: number;
  synthetic: boolean;
}

export interface Store {
  insertEvents: (rows: EventRow[]) => void;
  countSessions: (since: number, includeSynthetic: boolean) => number;
  countSynthetic: (since: number) => number;
  countByEvent: (since: number, includeSynthetic: boolean) => Map<string, number>;
  /** Уникальные сессии, в которых было событие. */
  sessionsByEvent: (since: number, includeSynthetic: boolean) => Map<string, number>;
  /**
   * Сессии, в которых произошли ВСЕ перечисленные события — честная воронка.
   * Иначе конверсия может превысить 100%: например, при входе по ссылке
   * «Поделиться планом» человек видит план, не проходя онбординг.
   */
  sessionsWithAll: (since: number, includeSynthetic: boolean, names: string[]) => number;
  topProps: (
    since: number,
    includeSynthetic: boolean,
    event: string,
    prop: string,
    limit: number,
  ) => { value: string; count: number }[];
  clearSynthetic: () => void;
  readCache: (key: string) => { payload: string; fetchedAt: number } | null;
  writeCache: (key: string, payload: string, fetchedAt: number) => void;
  close: () => void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  props_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS events_name ON events (name);

CREATE TABLE IF NOT EXISTS vacancy_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
`;

export function openStore(path: string): Store {
  if (path !== ':memory:') {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // Каталог уже есть или создать нельзя — падать на этом не стоит.
    }
  }

  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  const insert = db.prepare(
    'INSERT INTO events (session_id, name, props_json, created_at, synthetic) VALUES (?, ?, ?, ?, ?)',
  );

  const syntheticFilter = (includeSynthetic: boolean) =>
    includeSynthetic ? '' : ' AND synthetic = 0';

  return {
    insertEvents(rows) {
      db.exec('BEGIN');
      try {
        for (const row of rows) {
          insert.run(
            row.sessionId,
            row.name,
            JSON.stringify(row.props),
            row.createdAt,
            row.synthetic ? 1 : 0,
          );
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    countSessions(since, includeSynthetic) {
      const row = db
        .prepare(
          `SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE created_at >= ?${syntheticFilter(includeSynthetic)}`,
        )
        .get(since) as { n: number } | undefined;
      return row?.n ?? 0;
    },

    countSynthetic(since) {
      const row = db
        .prepare(
          'SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE created_at >= ? AND synthetic = 1',
        )
        .get(since) as { n: number } | undefined;
      return row?.n ?? 0;
    },

    countByEvent(since, includeSynthetic) {
      const rows = db
        .prepare(
          `SELECT name, COUNT(*) AS n FROM events WHERE created_at >= ?${syntheticFilter(includeSynthetic)} GROUP BY name`,
        )
        .all(since) as { name: string; n: number }[];
      return new Map(rows.map((r) => [r.name, r.n]));
    },

    sessionsByEvent(since, includeSynthetic) {
      const rows = db
        .prepare(
          `SELECT name, COUNT(DISTINCT session_id) AS n FROM events WHERE created_at >= ?${syntheticFilter(includeSynthetic)} GROUP BY name`,
        )
        .all(since) as { name: string; n: number }[];
      return new Map(rows.map((r) => [r.name, r.n]));
    },

    sessionsWithAll(since, includeSynthetic, names) {
      if (names.length === 0) return 0;
      const placeholders = names.map(() => '?').join(', ');
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT session_id
               FROM events
              WHERE created_at >= ?${syntheticFilter(includeSynthetic)}
                AND name IN (${placeholders})
              GROUP BY session_id
             HAVING COUNT(DISTINCT name) = ?
           )`,
        )
        .get(since, ...names, names.length) as { n: number } | undefined;
      return row?.n ?? 0;
    },

    topProps(since, includeSynthetic, event, prop, limit) {
      const rows = db
        .prepare(
          `SELECT json_extract(props_json, '$.' || ?) AS value, COUNT(*) AS n
             FROM events
            WHERE created_at >= ? AND name = ?${syntheticFilter(includeSynthetic)}
              AND json_extract(props_json, '$.' || ?) IS NOT NULL
            GROUP BY value
            ORDER BY n DESC
            LIMIT ?`,
        )
        .all(prop, since, event, prop, limit) as { value: string | null; n: number }[];
      return rows
        .filter((r) => r.value !== null)
        .map((r) => ({ value: String(r.value), count: r.n }));
    },

    clearSynthetic() {
      db.exec('DELETE FROM events WHERE synthetic = 1');
    },

    readCache(key) {
      const row = db
        .prepare('SELECT payload, fetched_at FROM vacancy_cache WHERE key = ?')
        .get(key) as { payload: string; fetched_at: number } | undefined;
      return row ? { payload: row.payload, fetchedAt: row.fetched_at } : null;
    },

    writeCache(key, payload, fetchedAt) {
      db.prepare(
        `INSERT INTO vacancy_cache (key, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      ).run(key, payload, fetchedAt);
    },

    close() {
      db.close();
    },
  };
}
