/**
 * Сценарий №1 из ТЗ: онбординг -> план -> карточка -> сравнение ->
 * добавить в план -> поделиться. Проходится целиком, как на защите.
 */
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, resetStorage } from './helpers';

test.describe('главный сценарий', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('онбординг из 4 шагов доводит до плана', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Не гадай — проложи курс' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: /Построить план за 4 вопроса/ }).click();

    // Шаг 1: предметы. Русский выбран и заблокирован.
    await expect(page.getByRole('heading', { name: 'Какие ЕГЭ ты сдаёшь?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Русский язык/ }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Дальше' })).toBeDisabled();

    for (const subject of ['Математика (профиль)', 'Физика', 'Информатика']) {
      await page.getByRole('button', { name: subject }).click();
    }
    await expect(page.getByRole('button', { name: 'Дальше' })).toBeEnabled();
    await page.getByRole('button', { name: 'Дальше' }).click();

    // Шаг 2: баллы и достижения.
    await expect(page.getByRole('heading', { name: 'Сколько баллов?' })).toBeVisible();
    await page.getByLabel('Русский язык').fill('78');
    await page.getByLabel('Математика (профиль)').fill('76');
    await page.getByLabel('Физика').fill('70');
    await page.getByLabel('Информатика').fill('72');
    await page.getByText('Знак ГТО').click();
    await expect(page.getByText(/Учтём/)).toContainText('+2');
    await page.getByRole('button', { name: 'Дальше' }).click();

    // Шаг 3: интересы, порядок выбора виден номерами.
    await expect(page.getByRole('heading', { name: 'Что тебе интересно?' })).toBeVisible();
    await page.getByRole('button', { name: /^Инженерия и производство/ }).click();
    await page.getByRole('button', { name: /^IT и программирование/ }).click();
    await page.getByRole('button', { name: /^Энергетика/ }).click();
    await page.getByRole('button', { name: 'Дальше' }).click();

    // Шаг 4: регион.
    await expect(page.getByRole('heading', { name: 'Где готов учиться?' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Твой регион' }).click();
    await page.getByRole('combobox', { name: 'Твой регион' }).fill('Нижегор');
    await page.getByRole('option', { name: 'Нижегородская область' }).click();
    await page.getByRole('button', { name: 'Построить план' }).click();

    // План.
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Бюджет|Рискованно|риск/);
    await expectNoHorizontalScroll(page);

    // НГТУ с закреплёнными зонами демо-сценария.
    const ngtu = page.locator('li.card', { hasText: 'Нижегородский государственный технический' });
    await expect(ngtu).toBeVisible();
    await expect(ngtu).toContainText('15.03.04');
    await expect(ngtu).toContainText('13.03.02');
    await expect(ngtu.getByText('Запасной').first()).toBeVisible();
  });

  test('карточка направления, сравнение и добавление в план', async ({ page }) => {
    await page.goto(`/?p=${(await import('./helpers')).DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    // Из плана — в карточку 15.03.04.
    await page.getByRole('link', { name: /15\.03\.04/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('15.03.04');
    await expect(page.getByRole('heading', { name: 'Сколько нужно баллов' })).toBeVisible();
    await expect(page.getByText('Демо').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Проходные баллы/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Чему научат' })).toBeVisible();
    await expect(page.getByText(/Зарплата выпускников/)).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Похожие направления -> сравнение.
    await expect(page.getByRole('heading', { name: 'Похожие направления' })).toBeVisible();
    const similar = page.locator('.similar-row', { hasText: '13.03.02' });
    await similar.getByRole('button', { name: 'Сравнить' }).click();
    await page.getByRole('link', { name: /Открыть сравнение/ }).click();

    await expect(page.getByRole('heading', { name: 'Сравнение направлений' })).toBeVisible();
    for (const row of [
      'Зона и запас',
      'Проходной 2025 и тренд',
      'Бюджетных мест',
      'Зарплата через год',
      'Зарплата через 5 лет',
      'Трудоустроены',
      'Чему научат',
    ]) {
      await expect(page.getByRole('rowheader', { name: row })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);

    // Обратно в план: 13.03.02 уже там, значит кнопка «В плане».
    await page.getByRole('link', { name: 'Мой план' }).first().click();
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible();
  });

  test('«Поделиться планом» переносит профиль в другую сессию', async ({ page, context }) => {
    await page.goto(`/?p=${(await import('./helpers')).DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    const verdict = await page.getByRole('heading', { level: 1 }).textContent();

    // Ссылку читаем из буфера обмена: так же, как её получит пользователь.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: /Скопировать ссылку/ }).click();
    await expect(page.getByRole('button', { name: /Ссылка скопирована/ })).toBeVisible();

    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('?p=');

    // Чистая сессия открывает ссылку и получает тот же вердикт.
    const fresh = await context.newPage();
    await fresh.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(fresh.getByRole('heading', { level: 1 })).toHaveText(verdict!.trim(), {
      timeout: 15_000,
    });
    await fresh.close();
  });

  test('правка плана мгновенно меняет вердикт и предупреждения', async ({ page }) => {
    await page.goto(`/?p=${(await import('./helpers')).DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    // Убираем все вузы: вердикт должен стать «не нашлось».
    const removeButtons = page.getByRole('button', { name: 'Убрать вуз' });
    const count = await removeButtons.count();
    for (let i = 0; i < count; i += 1) {
      await page.getByRole('button', { name: 'Убрать вуз' }).first().click();
    }

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Под твои баллы бюджетных мест не нашлось',
    );
    await expect(page.getByRole('heading', { name: 'В плане пока нет вузов' })).toBeVisible();
  });

  test('приоритеты меняются кнопками и нумерация пересчитывается', async ({ page }) => {
    await page.goto(`/?p=${(await import('./helpers')).DEMO_PROFILE_PARAM}`);
    await expect(page.getByText('Вердикт по твоему плану')).toBeVisible({ timeout: 15_000 });

    const ngtu = page.locator('li.card', { hasText: 'Нижегородский государственный технический' });
    const firstRow = ngtu.locator('.program-row').first();
    const secondRow = ngtu.locator('.program-row').nth(1);

    const firstBefore = await firstRow.locator('.program-name').textContent();
    const secondBefore = await secondRow.locator('.program-name').textContent();
    expect(firstBefore).not.toBe(secondBefore);

    await secondRow.getByRole('button', { name: 'Поднять приоритет' }).click();

    await expect(firstRow.locator('.program-name')).toHaveText(secondBefore!.trim());
    await expect(firstRow.locator('.program-priority-num')).toHaveText('1');
    await expect(secondRow.locator('.program-priority-num')).toHaveText('2');
  });
});
