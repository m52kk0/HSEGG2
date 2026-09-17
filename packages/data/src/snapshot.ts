/**
 * Снимок данных. Импортируется статически, поэтому фронт считает план в браузере
 * и не зависит от /api: без сети отваливаются только живые вакансии и аналитика.
 */
import type { Direction, Program, Region, University } from '@cursus/core';

import directionsRaw from '../../../data/snapshot/directions.json';
import regionsRaw from '../../../data/snapshot/regions.json';
import universitiesRaw from '../../../data/snapshot/universities.json';
import salariesRaw from '../../../data/snapshot/salaries.json';
import programsDemoRaw from '../../../data/snapshot/programs.demo.json';
import programsRealRaw from '../../../data/snapshot/programs.real.json';
import directionsContentRaw from '../../../data/content/directions.ru.json';

/** Дата, на которую собран снимок — показывается в интерфейсе и /api/health. */
export const SNAPSHOT_DATE = '2026-09-17';

export interface SalaryPoint {
  /** Средняя зарплата, ₽ в месяц. */
  salary: number | null;
  /** Доля трудоустроенных, %. */
  employed: number | null;
  /** Сколько выпускников в выборке. */
  graduates: number | null;
}

export interface SalaryEntry {
  /** Выпуск 2023 — примерно через год после выпуска. */
  y1: SalaryPoint | null;
  /** Выпуск 2019 — примерно через 5 лет после выпуска. */
  y5: SalaryPoint | null;
}

export interface SimilarDirection {
  code: string;
  /** Одна фраза о главной разнице. */
  diff: string;
}

export interface DirectionContent {
  /** «Чему научат» — 2-3 коротких предложения. */
  learn?: string;
  /** 3 профессии. */
  jobs?: string[];
  /** Поисковая строка для API «Работа России». */
  vacancyQuery?: string;
  similar?: SimilarDirection[];
}

type RawSalaryTriple = [number | null, number | null, number | null];

interface RawSalaries {
  source: string;
  note: string;
  data: Record<string, Record<string, { y1?: RawSalaryTriple | null; y5?: RawSalaryTriple | null }>>;
}

export const directions = directionsRaw as Direction[];
export const regions = regionsRaw as Region[];
export const universities = universitiesRaw as University[];
export const directionsContent = directionsContentRaw as Record<string, DirectionContent>;

const salariesSource = salariesRaw as unknown as RawSalaries;
export const SALARIES_SOURCE = salariesSource.source;
export const SALARIES_NOTE = salariesSource.note;

function toPoint(triple: RawSalaryTriple | null | undefined): SalaryPoint | null {
  if (!triple) return null;
  const [salary, employed, graduates] = triple;
  if (salary === null && employed === null && graduates === null) return null;
  return { salary, employed, graduates };
}

/** Зарплаты: region -> code -> { y1, y5 }. Ключ «RU» — данные по всей стране. */
export const salaries: Record<string, Record<string, SalaryEntry>> = (() => {
  const out: Record<string, Record<string, SalaryEntry>> = {};
  for (const [region, byCode] of Object.entries(salariesSource.data)) {
    const target: Record<string, SalaryEntry> = {};
    for (const [code, entry] of Object.entries(byCode)) {
      target[code] = { y1: toPoint(entry.y1), y5: toPoint(entry.y5) };
    }
    out[region] = target;
  }
  return out;
})();

/**
 * Программы: демо-снимок, поверх которого ложатся проверенные реальные значения.
 * Совпадение по universityId + code -> реальная запись побеждает и получает isDemo: false.
 */
export const programs: Program[] = (() => {
  const demo = programsDemoRaw as Program[];
  const real = programsRealRaw as Program[];
  if (real.length === 0) return demo;

  const merged = new Map<string, Program>();
  for (const p of demo) merged.set(`${p.universityId}|${p.code}`, p);
  for (const p of real) {
    const key = `${p.universityId}|${p.code}`;
    const base = merged.get(key);
    merged.set(key, {
      ...(base ?? p),
      ...p,
      id: base?.id ?? p.id,
      isDemo: false,
    });
  }
  return [...merged.values()];
})();

export const REAL_PROGRAMS_COUNT = (programsRealRaw as Program[]).length;
