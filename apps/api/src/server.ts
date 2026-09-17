/**
 * Точка входа: один процесс Node отдаёт и API, и собранный фронт.
 * Отдельной БД-службы и обратного прокси в MVP нет — см. docs/ARCHITECTURE.md.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { openStore } from './db';

const config = loadConfig();
const store = openStore(config.databasePath);
const app = createApp({ config, store });

const distPath = resolve(process.cwd(), config.webDist);
const indexPath = resolve(distPath, 'index.html');
const hasWeb = existsSync(indexPath);

if (hasWeb) {
  app.use(
    '/*',
    serveStatic({
      root: config.webDist,
      // Ассеты Vite содержат хэш в имени — их можно кэшировать надолго.
      onFound: (path, c) => {
        if (path.includes('/assets/')) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA-фолбэк: любой неизвестный путь отдаёт index.html, роутинг — на клиенте.
  const indexHtml = readFileSync(indexPath, 'utf8');
  app.get('/*', (c) => c.html(indexHtml));
} else {
  app.get('/', (c) =>
    c.text(
      'Cursus API работает. Собранного фронта нет: соберите его (pnpm build) или задайте WEB_DIST.',
    ),
  );
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.info(`Cursus на http://localhost:${info.port} (фронт: ${hasWeb ? 'есть' : 'нет'})`);
});

function shutdown(signal: string): void {
  console.info(`[api] ${signal}: закрываюсь`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
