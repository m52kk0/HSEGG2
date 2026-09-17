/**
 * Сценарии №2, №3 и №4 из ТЗ:
 *  - слабые баллы -> вердикт «Высокий риск» -> предупреждение -> План Б;
 *  - поиск по коду 15.03.04 -> карточка;
 *  - /api/* заблокирован -> план всё равно строится.
 */
import { expect, test } from '@playwright/test';
import {
  DEMO_PROFILE_PARAM,
  WEAK_PROFILE,
  expectNoHorizontalScroll,
  openPlanWithProfile,
  resetStorage,
} from './helpers';

test.describe('риск и План Б', () => {
  test('слабые баллы дают честный вердикт и ведут в План Б', async ({ page }) => {
    await resetStorage(page);
    await openPlanWithProfile(page, WEAK_PROFILE);

    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
    const verdict = page.getByRole('heading', { level: 1 });
    await expect(verdict).toHaveText(
      /Высокий риск остаться без бюджета|Рискованно: все варианты впритык|Под твои баллы бюджетных мест не нашлось/,
    );

    // Предупреждение про запасной вариант с действием.
    const alert = page.getByRole('alert').first();
    await expect(alert).toContainText(/запасной вариант/i);

    // План Б: четыре ветки со сроками, плюсами, минусами и чек-листом.
    await page.getByRole('link', { name: /Если не пройду никуда/ }).click();
    await expect(page.getByRole('heading', { name: 'Если не пройду никуда' })).toBeVisible();

    for (const branch of [
      'Дополнительный набор',
      'Платное обучение с переводом на бюджет',
      'Колледж, а потом вуз',
      'Год на подготовку',
    ]) {
      await expect(page.getByRole('heading', { name: branch })).toBeVisible();
    }
    await expect(page.getByText('Рекомендуем по твоему плану')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Сроки' }).first()).toBeVisible();
    await expect(page.getByText(/примерно с 12 августа/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('предупреждение о нескольких регионах появляется и называет их', async ({ page }) => {
    await resetStorage(page);
    await openPlanWithProfile(page, {
      ...WEAK_PROFILE,
      scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
      achievementsBonus: 2,
      interests: ['engineering', 'it', 'energy'],
      regionMode: 'several',
      homeRegion: 'Нижегородская область',
      regions: ['Республика Татарстан'],
    });

    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/В плане вузы из 2 регионов/)).toBeVisible();
    await expect(page.getByText('другой регион').first()).toBeVisible();
  });
});

test.describe('поиск', () => {
  test('поиск по коду 15.03.04 ведёт в карточку направления', async ({ page }) => {
    await resetStorage(page);
    await page.goto(`/?p=${DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Найти' }).first().click();
    await expect(page.getByRole('heading', { name: 'Найти направление' })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Поиск направления' }).fill('15.03.04');
    const result = page.getByRole('link', { name: /15\.03\.04/ }).first();
    await expect(result).toBeVisible();
    await result.click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('15.03.04');
    await expectNoHorizontalScroll(page);
  });

  test('поиск по названию тоже работает', async ({ page }) => {
    await resetStorage(page);
    await page.goto(`/?p=${DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    await page.goto('/search');
    await page.getByRole('searchbox', { name: 'Поиск направления' }).fill('электроэнергетика');
    await expect(page.getByRole('link', { name: /13\.03\.02/ }).first()).toBeVisible();
  });

  test('пустой результат объясняет, что делать', async ({ page }) => {
    await resetStorage(page);
    await page.goto(`/?p=${DEMO_PROFILE_PARAM}`);
    await page.goto('/search');
    await page
      .getByRole('searchbox', { name: 'Поиск направления' })
      .fill('квантовая алхимия и драконоведение');

    await expect(page.getByRole('heading', { name: 'Ничего не нашлось' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Снять фильтры' })).toBeVisible();
  });
});

test.describe('работа без API', () => {
  test('план строится при полностью заблокированном /api', async ({ page }) => {
    // Блокируем весь /api — остаться должно всё, кроме живых вакансий.
    await page.route('**/api/**', (route) => route.abort('failed'));

    await resetStorage(page);
    await page.goto(`/?p=${DEMO_PROFILE_PARAM}`);

    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Бюджет|Рискованно|риск/);

    const ngtu = page.locator('li.card', { hasText: 'Нижегородский государственный технический' });
    await expect(ngtu).toContainText('15.03.04');

    // Карточка направления: график и зарплаты из снимка, вакансии — честная плашка.
    await page.getByRole('link', { name: /15\.03\.04/ }).first().click();
    await expect(page.getByRole('img', { name: /Проходные баллы/ })).toBeVisible();
    await expect(page.getByText(/Зарплата выпускников/)).toBeVisible();
    await expect(page.getByText(/Живые вакансии сейчас недоступны/)).toBeVisible();

    // Сравнение и План Б тоже работают.
    await page.goto('/plan-b');
    await expect(page.getByRole('heading', { name: 'Если не пройду никуда' })).toBeVisible();
  });

  test('онбординг проходится без API', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    await resetStorage(page);

    await page.goto('/');
    await page.getByRole('button', { name: /Открыть пример плана/ }).click();
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
  });
});
