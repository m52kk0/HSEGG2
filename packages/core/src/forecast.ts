import type { CutoffForecast, Evaluation, Program, UserProfile, Zone } from './types';
import { TREND_CLAMP, ZONE_THRESHOLDS } from './config/zones';
import { examScore } from './score';

const CUTOFF_YEARS = [2023, 2024, 2025] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Прогноз проходного балла.
 *
 * trend = clamp(((c2025 − c2024) + (c2024 − c2023)) / 2, −10, +15)
 * predictedCutoff = round(c2025 + trend)
 *
 * Если известны не все годы — считаем по тем, что есть; по одному году trend = 0.
 */
export function predictCutoff(program: Program): CutoffForecast {
  const points: { year: number; value: number }[] = [];
  for (const year of CUTOFF_YEARS) {
    const value = program.cutoffs[String(year) as '2023' | '2024' | '2025'];
    if (typeof value === 'number' && Number.isFinite(value)) points.push({ year, value });
  }

  if (points.length === 0) {
    return { lastCutoff: null, years: [], trend: 0, predictedCutoff: null };
  }

  const last = points[points.length - 1]!;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    deltas.push(points[i]!.value - points[i - 1]!.value);
  }

  const rawTrend = deltas.length === 0 ? 0 : deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const trend = clamp(rawTrend, TREND_CLAMP.min, TREND_CLAMP.max);

  return {
    lastCutoff: last.value,
    years: points.map((p) => p.year),
    trend,
    predictedCutoff: Math.round(last.value + trend),
  };
}

/**
 * Зона по запасу баллов. Пороги — в config/zones.ts.
 *   margin >= +10        → safe
 *   −5 <= margin < +10   → target
 *   margin < −5          → reach
 */
export function zoneByMargin(margin: number): Zone {
  if (margin >= ZONE_THRESHOLDS.safe) return 'safe';
  if (margin >= ZONE_THRESHOLDS.target) return 'target';
  return 'reach';
}

/** Полная оценка программы под профиль: балл, прогноз, запас, зона. */
export function evaluate(program: Program, user: UserProfile): Evaluation {
  const score = examScore(program, user);
  const forecast = predictCutoff(program);
  const margin =
    forecast.predictedCutoff === null || !score.eligible
      ? null
      : score.total - forecast.predictedCutoff;

  return {
    program,
    score,
    forecast,
    margin,
    zone: margin === null ? null : zoneByMargin(margin),
  };
}

/** «+12» / «−8» / «0» — знак обязателен, это требование к показу чисел. */
export function formatMargin(margin: number): string {
  if (margin > 0) return `+${margin}`;
  if (margin < 0) return `−${Math.abs(margin)}`;
  return '0';
}
