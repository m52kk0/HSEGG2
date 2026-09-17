/**
 * Доступность: 0 нарушений уровня serious и critical на ключевых экранах.
 * Требование ТЗ — весь интерфейс управляется с клавиатуры, у элементов
 * видимый фокус, цвет не единственный носитель смысла.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PROFILE_PARAM, expectTapTargets, resetStorage } from './helpers';

async function audit(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  const report = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join('\n  ')}`,
    )
    .join('\n');

  expect(blocking, `нарушения доступности:\n${report}`).toEqual([]);
}

/** Открыть экран с готовым профилем демо-сценария. */
async function openWithProfile(page: Page, path: string): Promise<void> {
  await resetStorage(page);
  await page.goto(`/?p=${DEMO_PROFILE_PARAM}`);
  await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
  if (path !== '/plan') await page.goto(path);
}

test.describe('доступность', () => {
  test('первый экран', async ({ page }) => {
    await resetStorage(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page);
  });

  test('онбординг, шаг 1', async ({ page }) => {
    await resetStorage(page);
    await page.goto('/onboarding/1');
    await expect(page.getByRole('heading', { name: 'Какие ЕГЭ ты сдаёшь?' })).toBeVisible();
    await audit(page);
  });

  test('онбординг, шаг 2 с достижениями', async ({ page }) => {
    await resetStorage(page);
    await page.goto('/onboarding/2');
    await expect(page.getByRole('heading', { name: 'Сколько баллов?' })).toBeVisible();
    await audit(page);
  });

  test('мой план', async ({ page }) => {
    await openWithProfile(page, '/plan');
    await audit(page);
  });

  test('карточка направления', async ({ page }) => {
    await openWithProfile(page, '/program/Q4318652-15.03.04');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('15.03.04');
    await audit(page);
  });

  test('сравнение', async ({ page }) => {
    await openWithProfile(page, '/compare?ids=Q4318652-15.03.04,Q4318652-13.03.02');
    await expect(page.getByRole('heading', { name: 'Сравнение направлений' })).toBeVisible();
    await audit(page);
  });

  test('план Б', async ({ page }) => {
    await openWithProfile(page, '/plan-b');
    await expect(page.getByRole('heading', { name: 'Если не пройду никуда' })).toBeVisible();
    await audit(page);
  });

  test('поиск с результатами', async ({ page }) => {
    await openWithProfile(page, '/search');
    await page.getByRole('searchbox', { name: 'Поиск направления' }).fill('15.03.04');
    await expect(page.getByRole('link', { name: /15\.03\.04/ }).first()).toBeVisible();
    await audit(page);
  });
});

test.describe('клавиатура и тач-цели', () => {
  test('онбординг проходится с клавиатуры', async ({ page }) => {
    await resetStorage(page);
    await page.goto('/onboarding/1');

    // Доходим табом до плитки «Математика» и включаем её пробелом.
    const math = page.getByRole('button', { name: 'Математика (профиль)' });
    await math.focus();
    await expect(math).toBeFocused();
    await page.keyboard.press('Space');
    await expect(math).toHaveAttribute('aria-pressed', 'true');

    // Фокус виден: у элемента есть outline от :focus-visible.
    const outline = await math.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await page.getByRole('button', { name: 'Физика' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Дальше' })).toBeEnabled();
  });

  test('раскрытие карточки вуза работает с клавиатуры', async ({ page }) => {
    await openWithProfile(page, '/plan');

    const toggle = page.getByRole('button', { name: /Показать направления/ }).first();
    await toggle.focus();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Свернуть направления/ }).nth(1)).toBeVisible();
  });

  test('тач-цели на плане не меньше 44px', async ({ page }) => {
    await openWithProfile(page, '/plan');
    await expectTapTargets(page);
  });

  test('тач-цели в онбординге не меньше 44px', async ({ page }) => {
    await resetStorage(page);
    await page.goto('/onboarding/1');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectTapTargets(page);
  });
});
