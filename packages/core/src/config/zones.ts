// Пороги зон. Меняются только здесь — они же документированы в docs/ALGORITHM.md.

import type { Zone } from '../types';

/**
 * Границы по запасу баллов (margin = examScore − predictedCutoff):
 *   margin >= +10        → safe
 *   -5 <= margin < +10   → target
 *   margin < -5          → reach
 */
export const ZONE_THRESHOLDS = {
  /** Начиная с этого запаса — «Запасной». */
  safe: 10,
  /** Начиная с этого запаса — «Цель». */
  target: -5,
} as const;

/** Клампинг тренда проходного балла: тренд не бывает сильнее этих границ. */
export const TREND_CLAMP = { min: -10, max: 15 } as const;

export const ZONE_LABELS: Record<Zone, string> = {
  safe: 'Запасной',
  target: 'Цель',
  reach: 'Мечта',
};

/** Пояснение к зоне — одна фраза, без процентов вероятности. */
export const ZONE_HINTS: Record<Zone, string> = {
  safe: 'Запас от 10 баллов к прогнозу проходного — тут ты почти наверняка проходишь.',
  target: 'Твой балл рядом с прогнозом проходного — может хватить, а может и нет.',
  reach: 'Прогноз проходного выше твоего балла. Мечтать бесплатно: ставь такое первым приоритетом.',
};

/** Порядок «желанности»: мечта желаннее цели, цель желаннее запасного. */
export const ZONE_DESIRE_ORDER: readonly Zone[] = ['reach', 'target', 'safe'];

/** CSS-переменная цвета зоны. Цвет — только дополнение к слову, не носитель смысла. */
export const ZONE_CSS_VAR: Record<Zone, string> = {
  safe: '--zone-safe',
  target: '--zone-target',
  reach: '--zone-reach',
};
