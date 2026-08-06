import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating tests — these run against the .e2e.db copy (see e2e/global-setup.ts).
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('redigera personfält', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('button', { name: 'Redigera' }).first().click();
  await page.getByLabel('Giftasnamn').fill('Teständring');
  await page.getByRole('button', { name: 'Spara' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Teständring');
});

test('lägg till en händelse', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('button', { name: 'Lägg till händelse' }).click();
  await page.getByLabel('Typ').selectOption('OCCU');
  await page.getByLabel('Beskrivning').fill('Testyrke');
  await page.getByLabel(/^Datum/).fill('ABT 1970');
  await page.getByRole('button', { name: 'Spara' }).click();
  await expect(page.getByText('Testyrke')).toBeVisible();
});

test('lägg till ett barn via dialogen', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('button', { name: 'Lägg till barn' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Skapa ny person').check();
  await dialog.getByLabel('Förnamn').fill('Testbarn');
  await dialog.getByLabel('Efternamn').fill('Wedin');
  const familySelect = dialog.getByLabel('Familj');
  if (await familySelect.isVisible()) await familySelect.selectOption({ index: 0 });
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(page.getByRole('link', { name: /Testbarn/ })).toBeVisible();
});
