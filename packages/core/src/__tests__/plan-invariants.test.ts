/**
 * Инвариантные тесты плана на случайных входных данных.
 *
 * Примерные тесты проверяют разобранные случаи, а этот — свойства, которые
 * обязаны держаться на любом наборе: лимиты правил приёма, непрерывная
 * нумерация приоритетов, отсутствие неподходящих программ и гарантия подушки.
 * Генератор с фиксированным seed, поэтому падение всегда воспроизводимо.
 */
import { describe, expect, it } from 'vitest';
import { buildPlan, collectCandidates } from '../plan';
import { LIMITS } from '../config/campaign';
import { evaluate } from '../forecast';
import { allowedPrefixes, ugsn } from '../interests';
import { EXAM_SUBJECTS, INTEREST_IDS } from '../types';
import type {
  ExamRequirement,
  ExamSubject,
  InterestId,
  Program,
  RegionMode,
  University,
  UserProfile,
} from '../types';

function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ['Нижегородская область', 'Москва', 'Республика Татарстан', 'Омская область'];
const CODES = [
  '15.03.04', '15.03.05', '27.03.04', '09.03.01', '09.03.04', '13.03.02', '13.03.01',
  '38.03.01', '40.03.01', '31.05.01', '44.03.01', '03.03.02', '01.03.02', '21.03.01',
];

interface World {
  user: UserProfile;
  programs: Program[];
  universities: University[];
}

function randomWorld(random: () => number): World {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

  const subjectCount = int(1, EXAM_SUBJECTS.length);
  const scores: Partial<Record<ExamSubject, number>> = { russian: int(0, 100) };
  for (let i = 0; i < subjectCount; i += 1) scores[pick(EXAM_SUBJECTS)] = int(0, 100);

  const interests: InterestId[] = [];
  const interestCount = int(0, LIMITS.maxInterests);
  while (interests.length < interestCount) {
    const candidate = pick(INTEREST_IDS);
    if (!interests.includes(candidate)) interests.push(candidate);
  }

  const regionMode = pick<RegionMode>(['home', 'several', 'any']);
  const user: UserProfile = {
    scores,
    scoresAreExpected: random() < 0.5,
    achievementsBonus: int(-3, 14),
    achievements: [],
    interests,
    regionMode,
    homeRegion: random() < 0.9 ? pick(REGIONS) : null,
    regions: regionMode === 'several' ? [pick(REGIONS), pick(REGIONS)] : [],
  };

  const universities: University[] = Array.from({ length: int(1, 12) }, (_, i) => ({
    wikidata: `U${i}`,
    name: `Вуз ${i}`,
    city: `Город ${i}`,
    region: pick(REGIONS),
    site: null,
    lat: random() < 0.8 ? 50 + random() * 15 : null,
    lon: random() < 0.8 ? 30 + random() * 60 : null,
  }));

  const programs: Program[] = [];
  for (const u of universities) {
    for (let i = 0; i < int(0, 9); i += 1) {
      const code = pick(CODES);
      const id = `${u.wikidata}-${code}-${i}`;
      if (programs.some((p) => p.id === id)) continue;

      const first = pick(EXAM_SUBJECTS);
      const second = pick(EXAM_SUBJECTS);
      const exams: ExamRequirement[] =
        random() < 0.5
          ? [first, 'russian', [second, pick(EXAM_SUBJECTS)]]
          : [first, 'russian', second];

      const minScores: Partial<Record<ExamSubject, number>> = {};
      for (const requirement of exams) {
        for (const subject of Array.isArray(requirement) ? requirement : [requirement]) {
          minScores[subject] = int(39, 45);
        }
      }

      // Иногда данных по годам нет вовсе — это валидный случай снимка.
      const cutoffs: Program['cutoffs'] = {};
      if (random() < 0.9) cutoffs['2025'] = int(150, 290);
      if (random() < 0.8) cutoffs['2024'] = int(150, 290);
      if (random() < 0.7) cutoffs['2023'] = int(150, 290);

      programs.push({
        id,
        universityId: u.wikidata,
        code,
        name: `Направление ${code}`,
        budgetPlaces: int(10, 120),
        exams,
        minScores,
        cutoffs,
        isDemo: true,
      });
    }
  }

  return { user, programs, universities };
}

describe('buildPlan — инварианты на случайных данных', () => {
  const random = makeRandom(4242);
  const worlds = Array.from({ length: 400 }, () => randomWorld(random));

  it('никогда не превышает лимиты правил приёма', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      expect(plan.universities.length).toBeLessThanOrEqual(LIMITS.maxUniversities);
      for (const u of plan.universities) {
        expect(u.programs.length).toBeLessThanOrEqual(LIMITS.maxProgramsPerUniversity);
      }
    }
  });

  it('приоритеты внутри вуза идут подряд с единицы', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      for (const u of plan.universities) {
        expect(u.programs.map((p) => p.priority)).toEqual(
          u.programs.map((_, index) => index + 1),
        );
      }
    }
  });

  it('не содержит повторов вузов и направлений', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      const universityIds = plan.universities.map((u) => u.university.wikidata);
      expect(new Set(universityIds).size).toBe(universityIds.length);

      for (const u of plan.universities) {
        const ids = u.programs.map((p) => p.program.id);
        expect(new Set(ids).size).toBe(ids.length);
        // Направление всегда принадлежит своему вузу.
        for (const p of u.programs) {
          expect(p.program.universityId).toBe(u.university.wikidata);
        }
      }
    }
  });

  it('содержит только подходящие программы с посчитанной зоной', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      for (const u of plan.universities) {
        for (const p of u.programs) {
          const fresh = evaluate(p.program, world.user);
          expect(fresh.score.eligible).toBe(true);
          expect(fresh.zone).not.toBeNull();
          expect(p.zone).toBe(fresh.zone);
          expect(p.margin).toBe(fresh.margin);
        }
      }
    }
  });

  it('уважает выбранные регионы и интересы', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      const regions =
        world.user.regionMode === 'any'
          ? null
          : new Set(
              [
                world.user.homeRegion,
                ...(world.user.regionMode === 'several' ? world.user.regions : []),
              ].filter((r): r is string => r !== null),
            );
      const prefixes = allowedPrefixes(world.user.interests);

      for (const u of plan.universities) {
        if (regions && regions.size > 0) expect(regions.has(u.university.region)).toBe(true);
        for (const p of u.programs) {
          if (prefixes) expect(prefixes.has(ugsn(p.program.code))).toBe(true);
        }
      }
    }
  });

  it('если у выбранного вуза есть подушка, она остаётся в плане', () => {
    for (const world of worlds) {
      const candidates = collectCandidates({
        user: world.user,
        programs: world.programs,
        universities: world.universities,
      });
      const byId = new Map(candidates.map((c) => [c.university.wikidata, c]));
      const plan = buildPlan(world.user, world.programs, world.universities);

      for (const u of plan.universities) {
        const candidate = byId.get(u.university.wikidata);
        if (!candidate?.hasSafe) continue;
        expect(u.programs.some((p) => p.zone === 'safe')).toBe(true);
      }
    }
  });

  it('если у выбранного вуза есть мечта, она остаётся в плане', () => {
    for (const world of worlds) {
      const candidates = collectCandidates({
        user: world.user,
        programs: world.programs,
        universities: world.universities,
      });
      const byId = new Map(candidates.map((c) => [c.university.wikidata, c]));
      const plan = buildPlan(world.user, world.programs, world.universities);

      for (const u of plan.universities) {
        const candidate = byId.get(u.university.wikidata);
        if (!candidate?.hasReach) continue;
        expect(u.programs.some((p) => p.zone === 'reach')).toBe(true);
      }
    }
  });

  it('вердикт согласован с составом зон', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      const safeUniversities = plan.universities.filter((u) =>
        u.programs.some((p) => p.zone === 'safe'),
      ).length;
      const hasTarget = plan.universities.some((u) => u.programs.some((p) => p.zone === 'target'));

      if (plan.universities.length === 0) {
        expect(plan.verdict.level).toBe('empty');
      } else if (safeUniversities >= 2) {
        expect(plan.verdict.level).toBe('good');
      } else if (safeUniversities === 1 || hasTarget) {
        expect(plan.verdict.level).toBe('warning');
      } else {
        expect(plan.verdict.level).toBe('danger');
      }
    }
  });

  it('предупреждение «нет запасного» появляется тогда и только тогда, когда его нет', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      if (plan.universities.length === 0) continue;
      const hasSafe = plan.universities.some((u) => u.programs.some((p) => p.zone === 'safe'));
      const warned = plan.warnings.some((w) => w.id === 'no_safe');
      expect(warned).toBe(!hasSafe);
    }
  });

  it('симуляция описывает каждый вуз плана и все его приоритеты', () => {
    for (const world of worlds) {
      const plan = buildPlan(world.user, world.programs, world.universities);
      expect(plan.simulation).toHaveLength(plan.universities.length);

      for (const u of plan.universities) {
        const sim = plan.simulation.find((s) => s.universityId === u.university.wikidata);
        expect(sim).toBeDefined();
        expect(sim!.steps.map((s) => s.priority)).toEqual(u.programs.map((p) => p.priority));
      }
    }
  });

  it('повторный вызов на тех же данных даёт тот же план', () => {
    for (const world of worlds.slice(0, 60)) {
      const a = buildPlan(world.user, world.programs, world.universities);
      const b = buildPlan(world.user, world.programs, world.universities);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
