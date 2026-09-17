#!/usr/bin/env node
/**
 * Единственный файл запуска Cursus.
 *
 *   node start.mjs            автоматически: Docker, если он есть, иначе локально
 *   node start.mjs --docker   только через Docker
 *   node start.mjs --local    без Docker: собрать и запустить прод-сборку
 *   node start.mjs --dev      режим разработки: Vite + API с автоперезагрузкой
 *   node start.mjs --help     подсказка
 *
 * Скрипт сам проверяет окружение, ставит зависимости, собирает проект,
 * ждёт готовности и печатает адрес. Больше ничего запускать не нужно.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? '8080';
const HEALTH = `http://127.0.0.1:${PORT}/api/health`;
const IMAGE = 'cursus:latest';
const CONTAINER = 'cursus';
const MIN_NODE_MAJOR = 22;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

/* ----------------------------------------------------------------- вывод */

const ok = (text) => console.info(`  ✓ ${text}`);
const step = (text) => console.info(`\n→ ${text}`);
const warn = (text) => console.info(`  ! ${text}`);

function die(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function banner() {
  console.info('');
  console.info('  Cursus — навигатор поступления');
  console.info('  Не гадай — проложи курс');
  console.info('');
}

function help() {
  banner();
  console.info('  node start.mjs            Docker, если он есть, иначе локальная сборка');
  console.info('  node start.mjs --docker   только через Docker');
  console.info('  node start.mjs --local    без Docker: собрать и запустить прод-сборку');
  console.info('  node start.mjs --dev      режим разработки с автоперезагрузкой');
  console.info('');
  console.info(`  Порт задаётся переменной PORT (сейчас ${PORT}).`);
  console.info('  Токен админки — ADMIN_TOKEN; если он пуст, /admin открыт в демо-режиме.');
  console.info('');
  process.exit(0);
}

/* ------------------------------------------------------------ утилиты */

/**
 * На Windows pnpm и npm — это .cmd-обёртки, напрямую их не запустить.
 * Прогоняем через cmd /c одной строкой: и PATH ищется правильно,
 * и Node не ругается на неэкранированные аргументы (DEP0190).
 */
function toSpawn(command, commandArgs) {
  if (process.platform === 'win32' && /^(pnpm|npm|npx|corepack)$/.test(command)) {
    return {
      file: process.env.COMSPEC ?? 'cmd.exe',
      args: ['/d', '/s', '/c', [command, ...commandArgs].join(' ')],
    };
  }
  return { file: command, args: commandArgs };
}

/** Запуск команды с выводом в консоль. Возвращает код выхода. */
function run(command, commandArgs, options = {}) {
  const { file, args: spawnArgs } = toSpawn(command, commandArgs);
  const result = spawnSync(file, spawnArgs, { cwd: ROOT, stdio: 'inherit', ...options });
  return result.status ?? 1;
}

/** Тихий запуск: нужен только код выхода и вывод. */
function quiet(command, commandArgs) {
  const { file, args: spawnArgs } = toSpawn(command, commandArgs);
  const result = spawnSync(file, spawnArgs, { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function hasCommand(command, checkArgs = ['--version']) {
  return quiet(command, checkArgs).status === 0;
}

/**
 * Порт свободен? Проверяем до старта: иначе легко принять чужой процесс
 * на том же порту за свой и отрапортовать об успехе впустую.
 */
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // Без указания хоста — ровно так же, как слушает сам сервер (dual-stack).
    // С явным '0.0.0.0' Windows разрешает привязку, даже когда '::' уже занят.
    probe.listen(Number(port));
  });
}

async function requireFreePort() {
  if (await portIsFree(PORT)) return;
  die(
    `порт ${PORT} уже занят`,
    `Закрой процесс на этом порту или выбери другой: PORT=8081 node start.mjs`,
  );
}

async function waitForHealth(attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(HEALTH);
      if (response.ok) return await response.json();
    } catch {
      // Ещё поднимается.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function ready(health, mode) {
  console.info('');
  console.info('  ────────────────────────────────────────────────');
  console.info(`  Cursus работает: http://localhost:${PORT}`);
  console.info('');
  console.info(`  Режим:        ${mode}`);
  if (health) console.info(`  Данные:       снимок от ${health.snapshotDate}`);
  console.info(`  Аналитика:    http://localhost:${PORT}/admin`);
  console.info('  План защиты:  docs/DEMO.md');
  console.info('  ────────────────────────────────────────────────');
  console.info('');
}

/* ------------------------------------------------------------- Docker */

async function startDocker() {
  step('Проверяю Docker');
  if (!hasCommand('docker')) return { ok: false, reason: 'Docker не найден' };
  if (quiet('docker', ['info']).status !== 0) {
    return { ok: false, reason: 'Docker установлен, но демон не отвечает' };
  }
  ok('Docker доступен');

  if (!(await portIsFree(PORT))) {
    return { ok: false, reason: `порт ${PORT} уже занят` };
  }

  step('Собираю образ (первый раз это 1–2 минуты)');
  if (run('docker', ['build', '-t', IMAGE, '.']) !== 0) {
    return { ok: false, reason: 'сборка образа не удалась' };
  }
  ok(`образ ${IMAGE} собран`);

  step('Запускаю контейнер');
  quiet('docker', ['rm', '-f', CONTAINER]);

  const dockerArgs = [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-p',
    `${PORT}:8080`,
    '-v',
    'cursus-data:/data',
  ];
  if (process.env.ADMIN_TOKEN) dockerArgs.push('-e', `ADMIN_TOKEN=${process.env.ADMIN_TOKEN}`);
  dockerArgs.push(IMAGE);

  if (quiet('docker', dockerArgs).status !== 0) {
    return { ok: false, reason: `не удалось запустить контейнер (порт ${PORT} занят?)` };
  }

  const health = await waitForHealth();
  if (!health) {
    run('docker', ['logs', '--tail', '30', CONTAINER]);
    return { ok: false, reason: 'контейнер не ответил на /api/health' };
  }

  ok('контейнер здоров');
  ready(health, 'Docker (контейнер cursus)');
  console.info('  Остановить:   docker rm -f cursus');
  console.info('');
  return { ok: true };
}

/* ------------------------------------------------- локальный запуск */

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    die(
      `нужен Node ${MIN_NODE_MAJOR} или новее, а сейчас ${process.version}`,
      'Хранилище работает на встроенном модуле node:sqlite — в старых версиях его нет.',
    );
  }
  ok(`Node ${process.version}`);
}

/**
 * Пакетный менеджер для сборки. Если pnpm не установлен глобально,
 * поднимаем его через corepack — он идёт в комплекте с Node, так что
 * проверяющему ничего доустанавливать не нужно.
 */
function resolvePackageManager() {
  if (hasCommand('pnpm')) {
    ok('pnpm найден');
    return { command: 'pnpm', prefix: [] };
  }

  warn('pnpm не найден, включаю corepack (идёт в комплекте с Node)');
  if (hasCommand('corepack')) {
    quiet('corepack', ['enable']);
    quiet('corepack', ['prepare', 'pnpm@9.12.0', '--activate']);
    if (hasCommand('pnpm')) {
      ok('pnpm поднят через corepack');
      return { command: 'pnpm', prefix: [] };
    }
    if (quiet('corepack', ['pnpm', '--version']).status === 0) {
      ok('pnpm доступен как corepack pnpm');
      return { command: 'corepack', prefix: ['pnpm'] };
    }
  }

  die(
    'не удалось получить pnpm',
    'Установи вручную: npm i -g pnpm@9  — или запусти через Docker: node start.mjs --docker',
  );
  return null;
}

let pm = null;

/** Запуск скрипта pnpm выбранным способом. */
function pnpmRun(commandArgs) {
  return run(pm.command, [...pm.prefix, ...commandArgs]);
}

function ensureDependencies() {
  pm = resolvePackageManager();

  if (existsSync(resolve(ROOT, 'node_modules/@cursus/core'))) {
    ok('зависимости уже установлены');
    return;
  }

  step('Ставлю зависимости (первый раз это 1-2 минуты)');
  if (pnpmRun(['install']) !== 0) die('установка зависимостей не удалась');
  ok('зависимости установлены');
}

async function startLocal() {
  step('Проверяю окружение');
  checkNode();
  ensureDependencies();

  await requireFreePort();

  step('Собираю фронт и API');
  if (pnpmRun(['build']) !== 0) die('сборка не удалась');
  ok('сборка готова');

  step('Запускаю сервер');
  mkdirSync(resolve(ROOT, '.data'), { recursive: true });

  const server = spawn('node', ['apps/api/dist/index.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT,
      DATABASE_PATH: process.env.DATABASE_PATH ?? '.data/cursus.db',
      WEB_DIST: 'apps/web/dist',
    },
  });

  let exited = false;
  server.on('exit', () => {
    exited = true;
  });

  const health = await waitForHealth();

  // На /api/health мог ответить чужой процесс на том же порту, а наш —
  // упасть. Успех объявляем, только если наш сервер жив: даём событию
  // 'exit' дойти и перепроверяем.
  await new Promise((r) => setTimeout(r, 400));
  if (exited || server.exitCode !== null) {
    die('сервер завершился при старте', 'Причина — в выводе выше.');
  }

  if (!health) {
    server.kill();
    die(`сервер не ответил на ${HEALTH}`, `Попробуй другой порт: PORT=8081 node start.mjs`);
  }

  ready(health, 'локальная прод-сборка');
  console.info('  Остановить:   Ctrl+C');
  console.info('');

  const stop = () => {
    server.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => process.exit(code ?? 0));
}

/* -------------------------------------------------- режим разработки */

async function startDev() {
  step('Проверяю окружение');
  checkNode();
  ensureDependencies();
  await requireFreePort();

  console.info('');
  console.info('  Фронт: http://localhost:5173   (Vite, автоперезагрузка)');
  console.info(`  API:   http://localhost:${PORT}`);
  console.info('  Витрина дизайн-системы: http://localhost:5173/design');
  console.info('');

  const devSpawn = toSpawn(pm.command, [...pm.prefix, 'dev']);
  const dev = spawn(devSpawn.file, devSpawn.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT },
  });
  dev.on('exit', (code) => process.exit(code ?? 0));
}

/* ------------------------------------------------------------- точка входа */

if (has('--help') || has('-h')) help();

banner();

if (has('--dev')) {
  await startDev();
} else if (has('--local')) {
  await startLocal();
} else if (has('--docker')) {
  const result = await startDocker();
  if (!result.ok) die(result.reason, 'Попробуй локальный запуск: node start.mjs --local');
} else {
  // Автовыбор: контейнер предпочтительнее — он воспроизводим на любой машине.
  const result = await startDocker();
  if (!result.ok) {
    warn(`${result.reason}. Перехожу на локальный запуск.`);
    await startLocal();
  }
}
