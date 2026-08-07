import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('trädet renderas och piltangenter flyttar fokus', async ({ page }) => {
  await page.goto('/trad/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  const focusNode = page.locator('[data-tree-node="I500001"]');
  await expect(focusNode).toBeVisible();
  await focusNode.focus();
  await page.keyboard.press('ArrowUp'); // I500001 har 2 föräldrar
  const active = page.locator('[data-tree-node][tabindex="0"]');
  await expect(active).not.toHaveAttribute('data-tree-node', 'I500001');
});

test('klick på ett kort öppnar personpanelen', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.locator('[data-tree-node="I500001"]').click();
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
  await expect(panel.getByRole('heading', { name: 'Familj' })).toBeVisible();
  // panelen stängs med Escape
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('panelen kan fokusera om trädet och öppna personsidan', async ({ page }) => {
  await page.goto('/trad/I500001');
  // Enter på ett kort öppnar panelen
  await page.locator('[data-tree-node="I500001"]').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Fokusera trädet här' }).click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)I\d+/);
  await expect(panel).toBeHidden();

  await page.locator('[data-tree-node]').first().click();
  await page.getByRole('complementary', { name: 'Personuppgifter' })
    .getByRole('link', { name: 'Gå till personsida' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

test('listvyn är en likvärdig väg och kan fokusera om trädet', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('heading', { name: 'Förfäder' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ättlingar' })).toBeVisible();
  // :has(> h2 …) — only the inner list section, not the page-level <section> that also contains the heading
  const ancestorSection = page.locator('section:has(> h2:text-is("Förfäder"))');
  await ancestorSection.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)/);
});

test('personsidan länkar till trädet', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('link', { name: 'Visa i träd' }).click();
  await expect(page).toHaveURL(/\/trad\/I500001/);
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();
});
