import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E прогоняются на собранном фронте: так же, как он поедет в контейнер.
 * Два профиля — телефон 390x844 и десктоп 1280x800, как требует ТЗ.
 *
 * PLAYWRIGHT_CHANNEL=msedge позволяет использовать уже установленный браузер,
 * если скачивание сборки Chromium недоступно (закрытая сеть). В CI переменная
 * не задаётся и работает обычный Chromium.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL;
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        ...(channel ? { channel } : {}),
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        ...(channel ? { channel } : {}),
      },
    },
  ],

  // Прод-сборка на vite preview: API намеренно не поднимаем — сценарий
  // обязан проходиться без него, и это отдельный тест.
  webServer: {
    command: `pnpm --filter @cursus/web exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
