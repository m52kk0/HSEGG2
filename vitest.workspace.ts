import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineWorkspace([
  {
    // Ядро, данные, API, скрипты — чистый Node, без DOM.
    test: {
      name: 'node',
      environment: 'node',
      globals: true,
      include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  },
  {
    // Корень — сам пакет: react и его jsx-runtime лежат в apps/web/node_modules,
    // из корня монорепозитория они не разрешаются.
    root: fileURLToPath(new URL('./apps/web', import.meta.url)),
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  },
]);
