import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

const MINI = path.resolve('lib/gedcom/fixtures/mini.ged');

/**
 * The whole point of the feature: importing adds a tree, it does not touch the
 * one already there. Everything runs against .e2e.db and .e2e-trees.
 */
test('importera en GEDCOM till ett nytt släktträd, byt till det och ta bort det', async ({ page }) => {
  await page.goto('/');
  const wholeTree = await page.getByText(/personer/i).first().textContent();

  await page.getByRole('link', { name: 'Inställningar' }).click();
  await page.getByLabel('GEDCOM-fil').setInputFiles(MINI);
  await page.getByLabel('Namn på släktträdet').fill('Testsläkten');
  await page.getByRole('button', { name: 'Importera', exact: true }).click();

  // The summary is announced, not just drawn.
  await expect(page.getByText('Testsläkten: 3 personer, 1 familj, 1 källa')).toBeVisible();

  // The new tree is selectable, and the original is still first in the list.
  const picker = page.getByRole('combobox', { name: 'Släktträd' });
  await expect(picker.locator('option')).toHaveCount(2);

  await picker.selectOption({ label: 'Testsläkten' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('3', { exact: false }).first()).toBeVisible();

  // Its three people are the ones from the file, not from the Wedin tree.
  await page.getByRole('link', { name: 'Personer' }).click();
  await expect(page.getByRole('link', { name: /Sven-Erik Wedin/ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Anna Larsson/ })).toHaveCount(1);

  // Switching back shows the original tree, unchanged.
  await page.getByRole('link', { name: 'Hem' }).click();
  await picker.selectOption({ index: 0 });
  await expect(page.getByText(/personer/i).first()).toHaveText(wholeTree!);

  // Delete it again, and the app is back to one tree.
  await page.getByRole('link', { name: 'Inställningar' }).click();
  await page.getByRole('button', { name: 'Ta bort' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Testsläkten');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ta bort' }).click();
  await expect(picker.locator('option')).toHaveCount(1);
});

test('en fil som inte är GEDCOM skapar inget släktträd', async ({ page }) => {
  await page.goto('/installningar');
  await page.getByLabel('GEDCOM-fil').setInputFiles({
    name: 'anteckningar.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from('det här är inte en gedcom-fil'),
  });
  await page.getByRole('button', { name: 'Importera', exact: true }).click();

  await expect(page.getByText(/är det verkligen en GEDCOM-fil/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Släktträd' }).locator('option')).toHaveCount(1);
});

test('släktträdet kan byta namn', async ({ page }) => {
  await page.goto('/installningar');
  await page.getByLabel('GEDCOM-fil').setInputFiles(MINI);
  await page.getByLabel('Namn på släktträdet').fill('Fel namn');
  await page.getByRole('button', { name: 'Importera', exact: true }).click();
  await expect(page.getByText(/Fel namn: 3 personer/)).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: 'Fel namn' });
  await row.getByRole('button', { name: 'Byt namn' }).click();
  // Its own accessible name, distinct from the import form's "Namn på
  // släktträdet" field further up the same page.
  await page.getByLabel('Nytt namn för Fel namn').fill('Rätt namn');
  await page.getByRole('button', { name: 'Spara' }).click();

  await expect(page.getByRole('combobox', { name: 'Släktträd' })).toContainText('Rätt namn');

  // leave the suite as it found it
  const cleanup = page.getByRole('listitem').filter({ hasText: 'Rätt namn' });
  await cleanup.getByRole('button', { name: 'Ta bort' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ta bort' }).click();
  await expect(page.getByRole('combobox', { name: 'Släktträd' }).locator('option')).toHaveCount(1);
});
