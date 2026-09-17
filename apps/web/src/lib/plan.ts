import {
  LIMITS,
  buildPlan,
  collectCandidates,
  evaluate,
  interestRank,
  recomputePlan,
  type Evaluation,
  type Plan,
  type PlanProgram,
  type PlanUniversity,
  type Program,
  type UserProfile,
  type Zone,
} from '@cursus/core';
import { getProgram, getUniversity, programs, universities } from '@cursus/data';

/** Что именно лежит в localStorage: только идентификаторы, всё остальное считается. */
export interface PlanLayout {
  universities: { id: string; programIds: string[] }[];
}

export function layoutFromPlan(plan: Plan): PlanLayout {
  return {
    universities: plan.universities.map((u) => ({
      id: u.university.wikidata,
      programIds: u.programs.map((p) => p.program.id),
    })),
  };
}

/** Автоплан по профилю — стартовая точка, дальше пользователь правит вручную. */
export function autoPlan(profile: UserProfile): Plan {
  return buildPlan(profile, programs, universities);
}

/** Сколько вузов вообще подходит профилю — нужно для предупреждения «можно ещё». */
export function availableUniversityCount(profile: UserProfile): number {
  return collectCandidates({ user: profile, programs, universities }).length;
}

function scored(program: Program, profile: UserProfile): (Evaluation & { zone: Zone; margin: number }) | null {
  const e = evaluate(program, profile);
  if (e.zone === null || e.margin === null || !e.score.eligible) return null;
  return { ...e, zone: e.zone, margin: e.margin };
}

/** Пересборка плана из сохранённой раскладки: вердикт и предупреждения — свежие. */
export function planFromLayout(
  profile: UserProfile,
  layout: PlanLayout,
  availableUniversities: number,
): Plan {
  const planUniversities: PlanUniversity[] = [];

  for (const entry of layout.universities) {
    const university = getUniversity(entry.id);
    if (!university) continue;

    const items: PlanProgram[] = [];
    for (const programId of entry.programIds) {
      const program = getProgram(programId);
      if (!program) continue;
      const evaluation = scored(program, profile);
      if (!evaluation) continue;
      items.push({ ...evaluation, priority: items.length + 1 });
    }

    planUniversities.push({ university, programs: items, likelyAdmission: null });
  }

  return recomputePlan(planUniversities, availableUniversities);
}

export interface AddableProgram {
  program: Program;
  zone: Zone;
  margin: number;
}

/** Подходящие программы этого вуза, которых ещё нет в плане. */
export function addableProgramsOfUniversity(
  profile: UserProfile,
  universityId: string,
  alreadyInPlan: readonly string[],
): AddableProgram[] {
  const taken = new Set(alreadyInPlan);
  const result: AddableProgram[] = [];

  for (const program of programs) {
    if (program.universityId !== universityId || taken.has(program.id)) continue;
    const evaluation = scored(program, profile);
    if (!evaluation) continue;
    result.push({ program, zone: evaluation.zone, margin: evaluation.margin });
  }

  return result.sort((a, b) => {
    const ra = interestRank(a.program.code, profile.interests);
    const rb = interestRank(b.program.code, profile.interests);
    if (ra !== rb) return ra - rb;
    return b.margin - a.margin;
  });
}

export interface AddableUniversity {
  id: string;
  name: string;
  city: string;
  programsCount: number;
  bestZone: Zone;
  bestMargin: number;
}

/** Вузы, которых ещё нет в плане, отсортированные по пригодности. */
export function addableUniversities(
  profile: UserProfile,
  alreadyInPlan: readonly string[],
  limit = 20,
): AddableUniversity[] {
  const taken = new Set(alreadyInPlan);
  return collectCandidates({ user: profile, programs, universities })
    .filter((c) => !taken.has(c.university.wikidata))
    .slice(0, limit)
    .map((c) => {
      const best = [...c.programs].sort((a, b) => b.margin - a.margin)[0]!;
      return {
        id: c.university.wikidata,
        name: c.university.name,
        city: c.university.city,
        programsCount: c.programs.length,
        bestZone: best.zone,
        bestMargin: best.margin,
      };
    });
}

/** Начальный набор направлений при добавлении вуза в план вручную. */
export function initialProgramsForUniversity(profile: UserProfile, universityId: string): string[] {
  return addableProgramsOfUniversity(profile, universityId, [])
    .slice(0, LIMITS.maxProgramsPerUniversity)
    .map((p) => p.program.id);
}

export const planLimits = LIMITS;
