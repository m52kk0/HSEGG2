import type { ExamRequirement, Program, University, UserProfile } from '../types';

/** Профиль из демо-сценария ТЗ: 78/76/70/72 + ГТО = 228 баллов. */
export const demoUser: UserProfile = {
  scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
  scoresAreExpected: false,
  achievementsBonus: 2,
  achievements: ['Знак ГТО'],
  interests: ['engineering', 'it', 'energy'],
  regionMode: 'home',
  homeRegion: 'Нижегородская область',
  regions: [],
};

export function user(patch: Partial<UserProfile> = {}): UserProfile {
  return { ...demoUser, ...patch };
}

let counter = 0;

export function program(patch: Partial<Program> = {}): Program {
  counter += 1;
  const exams: ExamRequirement[] = patch.exams ?? ['math', 'russian', ['physics', 'informatics']];
  return {
    id: patch.id ?? `p${counter}`,
    universityId: patch.universityId ?? 'U1',
    code: patch.code ?? '15.03.04',
    name: patch.name ?? 'Автоматизация технологических процессов и производств',
    budgetPlaces: patch.budgetPlaces ?? 40,
    exams,
    minScores: patch.minScores ?? { math: 40, russian: 40, physics: 40, informatics: 40 },
    cutoffs: patch.cutoffs ?? { '2023': 214, '2024': 220, '2025': 225 },
    isDemo: patch.isDemo ?? true,
  };
}

export function university(patch: Partial<University> = {}): University {
  return {
    wikidata: patch.wikidata ?? 'U1',
    name: patch.name ?? 'Тестовый политехнический университет',
    city: patch.city ?? 'Нижний Новгород',
    region: patch.region ?? 'Нижегородская область',
    site: patch.site ?? null,
    lat: patch.lat ?? 56.3,
    lon: patch.lon ?? 44.0,
  };
}

/**
 * Программа с проходным, подобранным так, чтобы запас был ровно `margin`
 * относительно балла 228 (прогноз = 228 − margin, тренд нулевой).
 */
export function programWithMargin(margin: number, patch: Partial<Program> = {}): Program {
  const predicted = 228 - margin;
  return program({ ...patch, cutoffs: { '2023': predicted, '2024': predicted, '2025': predicted } });
}
