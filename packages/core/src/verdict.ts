import type { PlanUniversity, Verdict } from './types';

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function universitiesWord(n: number): string {
  return plural(n, 'вуз', 'вуза', 'вузов');
}

export function programsWord(n: number): string {
  return plural(n, 'направление', 'направления', 'направлений');
}

export function pointsWord(n: number): string {
  return plural(Math.abs(n), 'балл', 'балла', 'баллов');
}

/**
 * Вердикт — одна фраза сверху экрана «Мой план».
 * Считается только по зонам, без процентов вероятности.
 */
export function buildVerdict(universities: PlanUniversity[]): Verdict {
  if (universities.length === 0) {
    return {
      level: 'empty',
      title: 'Под твои баллы бюджетных мест не нашлось',
      detail: 'Это не тупик: посмотри, что делать дальше, на экране «Если не пройду никуда».',
    };
  }

  const withSafe = universities.filter((u) => u.programs.some((p) => p.zone === 'safe'));
  const targetCount = universities.reduce(
    (acc, u) => acc + u.programs.filter((p) => p.zone === 'target').length,
    0,
  );
  const hasTarget = targetCount > 0;

  if (withSafe.length >= 2) {
    return {
      level: 'good',
      title: 'Бюджет почти гарантирован',
      detail: `${withSafe.length} ${universitiesWord(withSafe.length)} с запасом${
        hasTarget ? `, ещё ${targetCount} ${programsWord(targetCount)} впритык` : ''
      }.`,
    };
  }

  if (withSafe.length === 1) {
    return {
      level: 'warning',
      title: 'Бюджет вероятен, но добавь ещё запасной вариант',
      detail: `Запас есть только в одном вузе — ${withSafe[0]!.university.name}.`,
    };
  }

  if (hasTarget) {
    return {
      level: 'warning',
      title: 'Рискованно: все варианты впритык',
      detail: `${targetCount} ${programsWord(targetCount)} рядом с проходным и ни одного с запасом.`,
    };
  }

  return {
    level: 'danger',
    title: 'Высокий риск остаться без бюджета',
    detail: 'Все выбранные направления — мечта: прогноз проходного выше твоего балла.',
  };
}
