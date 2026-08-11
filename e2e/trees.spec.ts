import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

const MINI = path.resolve('lib/gedcom/fixtures/mini.ged');

/**
 * The whole point of the feature: importing adds a tree, it does not touch the
 * one already there. Everything runs against the copies under .e2e/.
 */
test('importera en GEDCOM till ett nytt släktträd, byt till det och ta bort det', async ({ page }) => {
  await page.goto('/wedin');
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
  // Switching keeps you on the page you were on — only the tree changes.
  await expect(page).toHaveURL('/testslakten/installningar');

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
  await page.goto('/wedin/installningar');
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
  await page.goto('/wedin/installningar');
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

test('ett tomt släktträd går att skapa och fylla för hand', async ({ page }) => {
  await page.goto('/wedin/installningar');
  await page.getByLabel('Namn på det nya släktträdet').fill('Mormors släkt');
  await page.getByRole('button', { name: 'Skapa tomt släktträd' }).click();

  // man byter till det direkt, och det är tomt
  const picker = page.getByRole('combobox', { name: 'Släktträd' });
  await expect(picker).toHaveValue('mormors-slakt');
  await page.getByRole('link', { name: 'Personer' }).click();
  await expect(page.getByText('0 träffar')).toBeVisible();

  // trädvyn säger att trädet är tomt i stället för att påstå att API:et är nere
  await page.getByRole('link', { name: 'Träd', exact: true }).click();
  await expect(page.getByText(/tomt än/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // den första personen läggs till här — det finns ingen annan väg in
  await page.getByRole('link', { name: 'Till Personer' }).click();
  await page.getByRole('button', { name: 'Ny person' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Förnamn').fill('Karin');
  await dialog.getByLabel('Efternamn').fill('Mormorsdotter');
  await dialog.getByRole('button', { name: 'Spara' }).click();

  // och man landar på hens sida
  await expect(page).toHaveURL(/\/person\/I1$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Karin Mormorsdotter');

  // trädvyn utan id hittar nu den enda personen av sig själv
  await page.getByRole('link', { name: 'Träd', exact: true }).click();
  await expect(page).toHaveURL(/\/trad\/I1/);
  await expect(page.getByRole('group', { name: 'Släktträd' })).toBeVisible();

  // det ursprungliga trädet är orört
  await picker.selectOption({ index: 0 });
  await page.getByRole('link', { name: 'Personer' }).click();
  await expect(page.getByText('0 träffar')).toHaveCount(0);
});

/**
 * The reason the tree moved into the address.
 *
 * It used to live only in the browser, so `/person/I500001` meant whichever
 * tree the picker was last left on: a bookmark rotted the moment you looked at
 * something else, and a link you sent someone showed them a different person.
 * These check that an address now answers for itself.
 */
test('en adress säger vilket släktträd den gäller', async ({ page, context }) => {
  await page.goto('/wedin/personer?q=jens+wedin');
  await expect(page).toHaveURL('/wedin/personer?q=jens+wedin');

  // Import a second tree containing its own Sven-Erik Wedin.
  await page.goto('/wedin/installningar');
  await page.getByLabel('GEDCOM-fil').setInputFiles(MINI);
  await page.getByLabel('Namn på släktträdet').fill('Grannsläkten');
  await page.getByRole('button', { name: 'Importera', exact: true }).click();
  await expect(page.getByText(/Grannsläkten: 3 personer/)).toBeVisible();

  // The same path with the same search is two different sets of people.
  // The list is fetched after navigation, so wait for it before counting.
  const countWedins = async (url: string) => {
    await page.goto(url);
    await expect(page.getByText(/\d+ träff(ar)?\b/)).toBeVisible();
    return page.getByRole('link', { name: /Wedin/ }).count();
  };
  const grannar = await countWedins('/grannslakten/personer?q=wedin');
  const wedin = await countWedins('/wedin/personer?q=wedin');
  expect(grannar).toBeGreaterThan(0);
  expect(wedin).toBeGreaterThan(grannar);

  // A reload keeps the tree the address named — not the one last picked.
  await page.goto('/grannslakten/personer');
  await page.reload();
  await expect(page).toHaveURL('/grannslakten/personer');
  await expect(page.getByRole('combobox', { name: 'Släktträd' })).toHaveValue('grannslakten');

  // A fresh browser, with nothing stored, opens the tree the link names.
  const fresh = await context.browser()!.newContext();
  const other = await fresh.newPage();
  await other.goto('/grannslakten/personer');
  await expect(other.getByRole('combobox', { name: 'Släktträd' })).toHaveValue('grannslakten');
  await fresh.close();

  // An address from before trees were in the path still lands somewhere real.
  await page.goto('/personer?q=sven');
  await expect(page).toHaveURL(/\/[a-z-]+\/personer\?q=sven$/);

  // leave the suite as it found it
  await page.goto('/wedin/installningar');
  const cleanup = page.getByRole('listitem').filter({ hasText: 'Grannsläkten' });
  await cleanup.getByRole('button', { name: 'Ta bort' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ta bort' }).click();
  // Not a count: an earlier test leaves a tree of its own behind, so name the
  // one this test is responsible for.
  await expect(page.getByRole('combobox', { name: 'Släktträd' })).not.toContainText('Grannsläkten');
});

/**
 * The suite must be talking to its own copy of the database. A browser test
 * that reaches the development API edits the real family records, and the only
 * sign is a row nobody put there — which is exactly what happened once.
 */
test('sviten kör mot sin egen databas, inte den riktiga', async ({ request }) => {
  const { db } = await (await request.get('/api/health')).json();
  expect(db).toContain('.e2e');
  expect(db).not.toMatch(/[/\\]wedin-tree[/\\]wedin\.db$/);
});
