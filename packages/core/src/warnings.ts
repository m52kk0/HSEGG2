import type { PlanUniversity, PlanWarning } from './types';
import { LIMITS } from './config/campaign';
import { universitiesWord } from './verdict';

export interface WarningsInput {
  universities: PlanUniversity[];
  /** Сколько вузов вообще доступно под профиль — чтобы не предлагать несуществующее. */
  availableUniversities: number;
}

/**
 * Предупреждения о рисках плана. Метка «Демо» к предупреждениям не относится —
 * тестовые проходные показываются отдельной пометкой на цифре.
 */
export function buildWarnings({
  universities,
  availableUniversities,
}: WarningsInput): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  if (universities.length === 0) return warnings;

  const hasSafe = universities.some((u) => u.programs.some((p) => p.zone === 'safe'));
  if (!hasSafe) {
    warnings.push({
      id: 'no_safe',
      text: 'Добавь запасной вариант — направление с запасом от 10 баллов.',
      actionLabel: 'Найти запасной',
    });
  }

  // Порядок = порядок желания. Если первым стоит запасной, всё, что ниже,
  // никогда не сработает: зачислят на высший приоритет, по которому проходишь.
  for (const u of universities) {
    const first = u.programs[0];
    if (!first || first.zone !== 'safe') continue;
    const hasReachBelow = u.programs.slice(1).some((p) => p.zone === 'reach' || p.zone === 'target');
    if (!hasReachBelow) continue;
    warnings.push({
      id: 'safe_above_reach',
      universityId: u.university.wikidata,
      text: `${u.university.name}: направления ниже приоритета 1 никогда не сработают, если ты проходишь на первое. Поставь самое желанное первым.`,
      actionLabel: 'Поднять желанное',
    });
  }

  const room = Math.min(LIMITS.maxUniversities, availableUniversities) - universities.length;
  if (universities.length < 3 && room > 0) {
    warnings.push({
      id: 'few_universities',
      text: `Можно подать ещё в ${room} ${universitiesWord(room)} — это бесплатно увеличивает шансы.`,
      actionLabel: 'Добавить вуз',
    });
  }

  return warnings;
}
