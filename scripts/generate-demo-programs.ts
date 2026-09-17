/**
 * CLI-обёртка над генератором демо-программ.
 * Вся логика — в scripts/lib/generate-programs.ts, её проверяют тесты.
 *
 * Запуск: pnpm gen:programs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Direction, University } from '@cursus/core';
import { DEMO_SEED, generateDemoPrograms } from './lib/generate-programs';

/** Дата снимка. Задаётся здесь и в packages/data/src/snapshot.ts. */
const SNAPSHOT_DATE = '2026-09-17';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = resolve(HERE, '..', 'data/snapshot');

const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(SNAPSHOT, file), 'utf8')) as T;

const directions = read<Direction[]>('directions.json');
const universities = read<University[]>('universities.json');

const programs = generateDemoPrograms({ directions, universities });

writeFileSync(resolve(SNAPSHOT, 'programs.demo.json'), JSON.stringify(programs), 'utf8');

const realPath = resolve(SNAPSHOT, 'programs.real.json');
if (!existsSync(realPath)) writeFileSync(realPath, '[]\n', 'utf8');

// Маленький файл статистики для первого экрана: он не тянет за собой снимок.
const regions = read<unknown[]>('regions.json');
writeFileSync(
  resolve(SNAPSHOT, 'stats.json'),
  `${JSON.stringify(
    {
      date: SNAPSHOT_DATE,
      directions: directions.length,
      universities: universities.length,
      regions: regions.length,
      programs: programs.length,
    },
    null,
    2,
  )}
`,
  'utf8',
);

const universityCount = new Set(programs.map((p) => p.universityId)).size;
console.info(
  `programs.demo.json: ${programs.length} программ у ${universityCount} вузов (seed ${DEMO_SEED}).`,
);
