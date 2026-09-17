import { expect, type Page } from '@playwright/test';
import { encodeProfile, type UserProfile } from '@cursus/core';

/** Профиль демо-сценария из раздела 15 ТЗ, закодированный для ссылки. */
export const DEMO_PROFILE_PARAM =
  'eyJ2IjoxLCJzIjp7InJ1c3NpYW4iOjc4LCJtYXRoIjo3NiwicGh5c2ljcyI6NzAsImluZm9ybWF0aWNzIjo3Mn0sImUiOjAsImIiOjIsImEiOlsi0JfQvdCw0Log0JPQotCeIl0sImkiOlsiZW5naW5lZXJpbmciLCJpdCIsImVuZXJneSJdLCJtIjoiaG9tZSIsImgiOiLQndC40LbQtdCz0L7RgNC-0LTRgdC60LDRjyDQvtCx0LvQsNGB0YLRjCIsInIiOltdfQ';

/** Слабый профиль: все варианты — мечта, вердикт «Высокий риск». */
export const WEAK_PROFILE: UserProfile = {
  scores: { russian: 42, math: 40, physics: 40, informatics: 40 },
  scoresAreExpected: false,
  achievementsBonus: 0,
  achievements: [],
  interests: ['it'],
  regionMode: 'home',
  homeRegion: 'Москва',
  regions: [],
};

/**
 * Открыть план с готовым профилем через ссылку «Поделиться планом»:
 * так же, как это делает настоящий пользователь. Писать localStorage напрямую
 * нельзя — раскладку плана собирает стор, и без неё экран уводит на главную.
 */
export async function openPlanWithProfile(page: Page, profile: UserProfile): Promise<void> {
  await page.goto(`/?p=${encodeProfile(profile)}`);
}

export async function resetStorage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
}

/** Горизонтального скролла быть не должно ни на одном экране. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `горизонтальный скролл: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/** Все тач-цели не меньше 44px — требование ТЗ к мобильному интерфейсу. */
export async function expectTapTargets(page: Page, minSize = 44): Promise<void> {
  const small = await page.evaluate((min) => {
    const problems: string[] = [];
    const nodes = document.querySelectorAll('button, a[href], input, select');
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // скрытые элементы
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      // Ссылки внутри текста живут по правилам текста, а не кнопок.
      if (node.tagName === 'A' && node.closest('p, li, span')) continue;
      if (rect.height < min - 0.5) {
        problems.push(`${node.tagName}.${node.className} ${Math.round(rect.height)}px`);
      }
    }
    return problems;
  }, minSize);

  expect(small, `слишком мелкие тач-цели: ${small.join('; ')}`).toEqual([]);
}
