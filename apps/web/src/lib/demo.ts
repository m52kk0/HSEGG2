import type { UserProfile } from '@cursus/core';

/**
 * Профиль из демо-сценария ТЗ: 78 / 76 / 70 / 72 + знак ГТО = 228 баллов,
 * Нижегородская область, инженерия -> IT -> энергетика.
 *
 * Нужен для кнопки «Посмотреть на примере» на первом экране: жюри и родителям
 * проще понять продукт на заполненном плане, чем на пустом онбординге.
 */
export const DEMO_PROFILE: UserProfile = {
  scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
  scoresAreExpected: false,
  achievementsBonus: 2,
  achievements: ['Знак ГТО'],
  interests: ['engineering', 'it', 'energy'],
  regionMode: 'home',
  homeRegion: 'Нижегородская область',
  regions: [],
};
