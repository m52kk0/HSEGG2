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
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./apps/web/src/test/setup.ts'],
      include: ['apps/web/**/*.test.{ts,tsx}'],
    },
  },
]);
