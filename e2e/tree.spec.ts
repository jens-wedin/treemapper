import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('trädet renderas och piltangenter + Enter fokuserar om', async ({ page }) => {
  await page.goto('/trad/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  const focusNode = page.locator('[data-tree-node="I500001"]');
  await expect(focusNode).toBeVisible();
  await focusNode.focus();
  await page.keyboard.press('ArrowUp'); // I500001 har 2 föräldrar
  const active = page.locator('[data-tree-node][tabindex="0"]');
  await expect(active).not.toHaveAttribute('data-tree-node', 'I500001');
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/\/trad\/I500001/);
  await expect(page).toHaveURL(/\/trad\//);
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
