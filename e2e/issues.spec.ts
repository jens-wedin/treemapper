import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating tests — these run against the .e2e.db copy (see e2e/global-setup.ts).
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('kön visar problem värst först med kategorifilter', async ({ page }) => {
  await page.goto('/konsekvens');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Konsekvensbänken');
  await expect(page.getByText(/kvar av .* flaggade/)).toBeVisible();
  // första kortet är ett logiskt fel (värst först)
  const firstCard = page.locator('li').filter({ hasText: 'Logiskt fel' }).first();
  await expect(firstCard).toBeVisible();
  await expect(page.getByLabel('Kategori')).toBeVisible();
});

test('avfärda döljer problemet och Visa avfärdade återställer det', async ({ page }) => {
  await page.goto('/konsekvens?kategori=' + encodeURIComponent('Födsel efter bortgång'));
  const cards = page.locator('ul > li');
  await expect(cards.first()).toBeVisible();   // listan hämtas asynkront
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);

  await cards.first().getByRole('button', { name: 'Avfärda' }).click();
  await expect(cards).toHaveCount(before - 1);

  // .click() (inte .check()) — kryssrutan styrs av URL-läget via React
  const toggle = page.getByLabel('Visa avfärdade');
  await toggle.click();
  await expect(toggle).toBeChecked();
  const dismissedCard = cards.filter({ hasText: 'Avfärdad' }).first();
  await expect(dismissedCard).toBeVisible();
  await dismissedCard.getByRole('button', { name: 'Återställ' }).click();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(cards).toHaveCount(before);
});

test('Åtgärda leder till personsidan', async ({ page }) => {
  await page.goto('/konsekvens?kategori=' + encodeURIComponent('Födsel efter bortgång'));
  await expect(page.locator('ul > li').first()).toBeVisible();
  await page.locator('ul > li').first().getByRole('link', { name: 'Åtgärda' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('dubblettsammanslagning tar bort den ena posten', async ({ page }) => {
  await page.goto('/konsekvens?kategori=' + encodeURIComponent('Möjlig dubblett'));
  const card = page.locator('ul > li').first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Slå ihop' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Sammanslagningen tar bort den andra posten', { exact: false })).toBeVisible();
  // vänta in personuppgifterna och läs ut vilka två poster som jämförs
  await expect(dialog.locator('table')).toBeVisible();
  const ids = await dialog.locator('th').allTextContents();
  const duplicateId = ids.join(' ').match(/I\d+/g)?.[1];
  expect(duplicateId).toBeTruthy();

  await dialog.getByRole('button', { name: 'Slå ihop posterna' }).click();
  await expect(dialog).toBeHidden();

  // den borttagna posten finns inte längre
  await page.goto(`/person/${duplicateId}`);
  await expect(page.getByText('Personen finns inte')).toBeVisible();
});

test('hem visar konsekvens-resultattavlan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Konsekvensproblem' })).toBeVisible();
  await page.getByRole('link', { name: 'Konsekvensbänken' }).click();
  await expect(page).toHaveURL(/\/konsekvens/);
});
