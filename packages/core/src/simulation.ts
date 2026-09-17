import type { PlanUniversity, SimulationStep, UniversitySimulation, Zone } from './types';

/** Текстовая модель исхода по зоне. Это не вероятность — так и написано в докам. */
const OUTCOME: Record<Zone, string> = {
  reach: 'вероятно не пройдёшь',
  target: 'на грани',
  safe: 'проходишь',
};

/**
 * Симуляция «Что будет, если…»: цепочка по приоритетам внутри каждого вуза.
 * Зачисляют на направление с наивысшим приоритетом, по которому абитуриент
 * проходит, — значит первый `safe` в списке и есть ожидаемый исход.
 */
export function buildSimulation(universities: PlanUniversity[]): UniversitySimulation[] {
  return universities.map((u) => {
    const steps: SimulationStep[] = u.programs.map((p) => ({
      priority: p.priority,
      programName: p.program.name,
      code: p.program.code,
      zone: p.zone,
      outcome: OUTCOME[p.zone],
    }));

    const likely = u.programs.find((p) => p.zone === 'safe') ?? null;
    const borderline = u.programs.find((p) => p.zone === 'target') ?? null;
    const chosen = likely ?? borderline;

    const result = chosen
      ? `Скорее всего зачислят на: ${chosen.program.code} · ${chosen.program.name}${
          likely ? '' : ' — но это впритык, запасного варианта в этом вузе нет'
        }`
      : 'В этом вузе запасного варианта нет: если не пройдёшь по мечте, зачисления не будет';

    return {
      universityId: u.university.wikidata,
      universityName: u.university.name,
      steps,
      result,
    };
  });
}

/** Короткий итог для заголовка карточки вуза. */
export function likelyAdmissionLabel(programs: PlanUniversity['programs']): string | null {
  const chosen = programs.find((p) => p.zone === 'safe') ?? programs.find((p) => p.zone === 'target');
  return chosen ? `${chosen.program.code} · ${chosen.program.name}` : null;
}
