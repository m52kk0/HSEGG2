/**
 * Smoke-проверка контейнера: собрать, запустить, убедиться, что живы и API,
 * и фронт. Запускается в CI после сборки образа: pnpm docker:smoke
 */
import { execFileSync, spawnSync } from 'node:child_process';

const IMAGE = 'cursus:smoke';
const NAME = 'cursus-smoke-ci';
const PORT = process.env.SMOKE_PORT ?? '8099';
const MAX_IMAGE_MB = 250;

function run(cmd, args, options = {}) {
  const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  // При stdio: 'inherit' вывод не возвращается — это нормально.
  return typeof out === 'string' ? out.trim() : '';
}

function quiet(cmd, args) {
  spawnSync(cmd, args, { stdio: 'ignore' });
}

function fail(message) {
  console.error(`✗ ${message}`);
  quiet('docker', ['logs', '--tail', '40', NAME]);
  quiet('docker', ['rm', '-f', NAME]);
  process.exit(1);
}

async function waitFor(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Контейнер ещё поднимается.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

quiet('docker', ['rm', '-f', NAME]);

console.info('→ docker build');
run('docker', ['build', '-t', IMAGE, '.'], { stdio: 'inherit' });

const size = run('docker', ['image', 'inspect', IMAGE, '--format', '{{.Size}}']);
const sizeMb = Math.round(Number(size) / 1024 / 1024);
// docker image inspect отдаёт сжатый размер; на диске образ крупнее —
// точное значение видно в `docker images`.
console.info(`→ размер образа (inspect): ${sizeMb} МБ, лимит ${MAX_IMAGE_MB} МБ`);
if (sizeMb > MAX_IMAGE_MB) fail(`образ больше ${MAX_IMAGE_MB} МБ`);

console.info('→ docker run');
run('docker', ['run', '-d', '--name', NAME, '-p', `${PORT}:8080`, IMAGE]);

const health = await waitFor(`http://127.0.0.1:${PORT}/api/health`);
if (!health) fail('GET /api/health не ответил 200');

const healthBody = await health.json();
if (healthBody.status !== 'ok') fail(`неожиданный ответ health: ${JSON.stringify(healthBody)}`);
console.info(`✓ /api/health: ${JSON.stringify(healthBody)}`);

const index = await fetch(`http://127.0.0.1:${PORT}/`);
const html = await index.text();
if (!index.ok) fail(`GET / вернул ${index.status}`);
if (!html.includes('Cursus')) fail('главная страница не содержит «Cursus»');
console.info('✓ GET / содержит Cursus');

// SPA-фолбэк: внутренний маршрут должен отдавать index.html, а не 404.
const spa = await fetch(`http://127.0.0.1:${PORT}/plan`);
if (!spa.ok) fail(`SPA-фолбэк на /plan вернул ${spa.status}`);
console.info('✓ SPA-фолбэк работает');

// Вакансии не имеют права отдать 5xx, даже если внешний API недоступен.
const vacancies = await fetch(`http://127.0.0.1:${PORT}/api/vacancies?q=инженер`);
if (vacancies.status >= 500) fail(`/api/vacancies вернул ${vacancies.status}`);
const vacanciesBody = await vacancies.json();
if (!['live', 'cache', 'snapshot'].includes(vacanciesBody.source)) {
  fail(`неожиданный источник вакансий: ${vacanciesBody.source}`);
}
console.info(`✓ /api/vacancies: source=${vacanciesBody.source}`);

const user = run('docker', ['inspect', '--format', '{{.Config.User}}', NAME]);
if (user !== 'node') fail(`контейнер должен работать не от root, а сейчас: «${user}»`);
console.info('✓ контейнер работает от пользователя node');

quiet('docker', ['rm', '-f', NAME]);
console.info('\nSmoke-проверка контейнера пройдена.');
