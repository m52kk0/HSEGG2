import { createApp, type AppDeps } from '../app';
import { loadConfig, type Config } from '../config';
import { openStore, type Store } from '../db';

export function testConfig(patch: Partial<Config> = {}): Config {
  return { ...loadConfig({}), databasePath: ':memory:', ...patch };
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  store: Store;
  close: () => void;
}

/** Приложение с базой в памяти: тесты не трогают файловую систему. */
export function harness(
  patch: Omit<Partial<AppDeps>, 'config'> & { config?: Partial<Config> } = {},
): Harness {
  const config = testConfig(patch.config);
  const store = patch.store === null ? null : (patch.store ?? openStore(':memory:'));
  const app = createApp({ ...patch, config, store });
  return {
    app,
    store: store as Store,
    close: () => store?.close(),
  };
}

/** Ответ API «Работа России» в том виде, в каком он приходит. */
export function trudvsemResponse(count = 2, total = count): unknown {
  return {
    status: '200',
    meta: { total, limit: 20 },
    results: {
      vacancies: Array.from({ length: count }, (_, i) => ({
        vacancy: {
          'job-name': `Инженер АСУ ТП ${i + 1}`,
          salary_min: 70000 + i * 1000,
          salary_max: 90000 + i * 1000,
          company: { name: `АО «Завод ${i + 1}»` },
          vac_url: `https://trudvsem.ru/vacancy/card/${i + 1}`,
        },
      })),
    },
  };
}

export function okFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

export function failingFetch(status = 503): typeof fetch {
  return (async () => new Response('nope', { status })) as unknown as typeof fetch;
}

/** fetch, который никогда не отвечает: проверка таймаута и AbortSignal. */
export function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
    })) as unknown as typeof fetch;
}

export function throwingFetch(): typeof fetch {
  return (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
}
