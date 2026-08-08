import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating tests — these run against the .e2e.db copy (see e2e/global-setup.ts).
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('kön grupperas efter allvarlighetsgrad, värst först', async ({ page }) => {
  await page.goto('/konsekvens');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Konsekvensbänken');
  await expect(page.getByText(/kvar av .* flaggade/)).toBeVisible();

  const headings = page.getByRole('heading', { level: 2 });
  await expect(headings.first()).toContainText('Logiskt fel');
  await expect(headings.nth(1)).toContainText('Dubblett');
  await expect(page.getByLabel('Kategori')).toBeVisible();
});

test('filtren byter ut listan i stället för att lägga till i den', async ({ page }) => {
  await page.goto('/konsekvens');
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('Logiskt fel');

  // Att välja en varningskategori får inte lämna kvar de logiska felen —
  // dubbletta React-nycklar gjorde tidigare att gamla kort blev kvar.
  await page.getByLabel('Kategori').selectOption('Dödsfall utan datum');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Varning');
  const categories = page.locator('ul > li > div > span.font-medium');
  await expect(categories.first()).toBeVisible();
  const distinct = new Set(await categories.allTextContents());
  expect([...distinct]).toEqual(['Dödsfall utan datum']);

  // och gradfiltret når de grupper som annars ligger bortom de 500 första
  await page.getByLabel('Kategori').selectOption('');
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('Logiskt fel');

  await page.getByLabel('Allvarlighetsgrad').selectOption('minor');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Småfel');
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

test('personsidan avslutar med personens konsekvenser', async ({ page }) => {
  // I500244 har fyra barn födda efter sin egen död, plus fler problem
  await page.goto('/person/I500244');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Konsekvenser' }) });
  await expect(section).toBeVisible();

  // sist på sidan, efter källhänvisningarna
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings[headings.length - 1]).toBe('Konsekvenser');

  // samma gruppering som i trädets panel: en rubrik per kategori, med antal
  const group = section.getByRole('listitem').filter({ hasText: 'Barn fött efter förälders bortgång' });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('(4)');
  await expect(group).toContainText('efter faderns Abraham Abrahamsson död 1800');

  // och ingen rubrik alls för den som inte har något flaggat
  await page.goto('/person/I500001');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Konsekvenser' })).toHaveCount(0);
});

test('historiken visar vad som rättats och vad som lagts åt sidan', async ({ page }) => {
  await page.goto('/konsekvens');
  const log = page.locator('details');
  await expect(log).toContainText('Åtgärdat och avfärdat');
  // hopfälld tills man ber om den — kön är sidans huvudsak
  await expect(log.locator('ol > li').first()).toBeHidden();
  await log.locator('summary').click();
  await expect(log).toHaveAttribute('open', '');

  // wedin.db bär med sig tidigare rättningar ur audit_log
  const first = log.locator('ol > li').first();
  await expect(first).toBeVisible();
  await expect(first).toContainText('Rättat');

  // och en avfärdning hamnar överst, med sin kategori och anteckning
  const category = 'Dubbla mellanslag i namnet';
  await page.goto('/konsekvens?kategori=' + encodeURIComponent(category));
  await expect(page.locator('ul > li').first()).toBeVisible();
  await page.locator('ul > li').first().getByRole('button', { name: 'Avfärda' }).click();

  await log.locator('summary').click();
  await expect(log.locator('ol > li').first()).toContainText('Avfärdat');
  await expect(log.locator('ol > li').first()).toContainText(category);
});
