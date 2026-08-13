import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

const MINI = path.resolve('lib/gedcom/fixtures/mini.ged');

/**
 * The whole point of the feature: importing adds a tree, it does not touch the
 * one already there. Everything runs against the copies under .e2e/.
 */
test('import a GEDCOM into a new family tree, switch to it, and delete it', async ({ page }) => {
  await page.goto('/wedin');
  const wholeTree = await page.getByText(/people/i).first().textContent();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('GEDCOM file').setInputFiles(MINI);
  await page.getByLabel('Name of the family tree').fill('Testsläkten');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  // The summary is announced, not just drawn.
  await expect(page.getByText('Testsläkten: 3 people, 1 family, 1 source')).toBeVisible();

  // The new tree is selectable, and the original is still first in the list.
  const picker = page.getByRole('combobox', { name: 'Family tree' });
  await expect(picker.locator('option')).toHaveCount(2);

  await picker.selectOption({ label: 'Testsläkten' });
  // Switching keeps you on the page you were on — only the tree changes.
  await expect(page).toHaveURL('/testslakten/settings');

  // Its three people are the ones from the file, not from the Wedin tree.
  await page.getByRole('link', { name: 'People' }).click();
  await expect(page.getByRole('link', { name: /Sven-Erik Wedin/ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Anna Larsson/ })).toHaveCount(1);

  // Switching back shows the original tree, unchanged.
  await page.getByRole('link', { name: 'Home' }).click();
  await picker.selectOption({ index: 0 });
  await expect(page.getByText(/people/i).first()).toHaveText(wholeTree!);

  // Delete it again, and the app is back to one tree.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Testsläkten');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(picker.locator('option')).toHaveCount(1);
});

test('a file that is not GEDCOM creates no family tree', async ({ page }) => {
  await page.goto('/wedin/settings');
  await page.getByLabel('GEDCOM file').setInputFiles({
    name: 'anteckningar.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not a gedcom file'),
  });
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page.getByText(/is it really a GEDCOM file/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Family tree' }).locator('option')).toHaveCount(1);
});

test('a family tree can be renamed', async ({ page }) => {
  await page.goto('/wedin/settings');
  await page.getByLabel('GEDCOM file').setInputFiles(MINI);
  await page.getByLabel('Name of the family tree').fill('Fel namn');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Fel namn: 3 people/)).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: 'Fel namn' });
  await row.getByRole('button', { name: 'Rename' }).click();
  // Its own accessible name, distinct from the import form's "Name of the
  // family tree" field further up the same page.
  await page.getByLabel('New name for Fel namn').fill('Rätt namn');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('combobox', { name: 'Family tree' })).toContainText('Rätt namn');

  // leave the suite as it found it
  const cleanup = page.getByRole('listitem').filter({ hasText: 'Rätt namn' });
  await cleanup.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('combobox', { name: 'Family tree' }).locator('option')).toHaveCount(1);
});

test('an empty family tree can be created and filled by hand', async ({ page }) => {
  await page.goto('/wedin/settings');
  await page.getByLabel('Name of the new family tree').fill('Mormors släkt');
  await page.getByRole('button', { name: 'Create an empty family tree' }).click();

  // you switch to it straight away, and it is empty
  const picker = page.getByRole('combobox', { name: 'Family tree' });
  await expect(picker).toHaveValue('mormors-slakt');
  await page.getByRole('link', { name: 'People' }).click();
  await expect(page.getByText('0 results')).toBeVisible();

  // the tree view says the tree is empty rather than claiming the API is down
  await page.getByRole('link', { name: 'Tree', exact: true }).click();
  await expect(page.getByText(/empty/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // the first person is added here — there is no other way in
  await page.getByRole('link', { name: 'Go to People' }).click();
  await page.getByRole('button', { name: 'New person' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('First name').fill('Karin');
  await dialog.getByLabel('Surname').fill('Mormorsdotter');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // and you land on their page
  await expect(page).toHaveURL(/\/person\/I1$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Karin Mormorsdotter');

  // the tree view with no id now finds the only person by itself
  await page.getByRole('link', { name: 'Tree', exact: true }).click();
  await expect(page).toHaveURL(/\/tree\/I1/);
  await expect(page.getByRole('group', { name: 'Family tree' })).toBeVisible();

  // the original tree is untouched
  await picker.selectOption({ index: 0 });
  await page.getByRole('link', { name: 'People' }).click();
  await expect(page.getByText('0 results')).toHaveCount(0);
});

/**
 * The reason the tree moved into the address.
 *
 * It used to live only in the browser, so `/person/I500001` meant whichever
 * tree the picker was last left on: a bookmark rotted the moment you looked at
 * something else, and a link you sent someone showed them a different person.
 * These check that an address now answers for itself.
 */
test('an address says which family tree it belongs to', async ({ page, context }) => {
  await page.goto('/wedin/people?q=jens+wedin');
  await expect(page).toHaveURL('/wedin/people?q=jens+wedin');

  // Import a second tree containing its own Sven-Erik Wedin.
  await page.goto('/wedin/settings');
  await page.getByLabel('GEDCOM file').setInputFiles(MINI);
  await page.getByLabel('Name of the family tree').fill('Grannsläkten');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Grannsläkten: 3 people/)).toBeVisible();

  // The same path with the same search is two different sets of people.
  // The list is fetched after navigation, so wait for it before counting.
  const countWedins = async (url: string) => {
    await page.goto(url);
    await expect(page.getByText(/\d+ results?\b/)).toBeVisible();
    return page.getByRole('link', { name: /Wedin/ }).count();
  };
  const grannar = await countWedins('/grannslakten/people?q=wedin');
  const wedin = await countWedins('/wedin/people?q=wedin');
  expect(grannar).toBeGreaterThan(0);
  expect(wedin).toBeGreaterThan(grannar);

  // A reload keeps the tree the address named — not the one last picked.
  await page.goto('/grannslakten/people');
  await page.reload();
  await expect(page).toHaveURL('/grannslakten/people');
  await expect(page.getByRole('combobox', { name: 'Family tree' })).toHaveValue('grannslakten');

  // A fresh browser, with nothing stored, opens the tree the link names.
  const fresh = await context.browser()!.newContext();
  const other = await fresh.newPage();
  await other.goto('/grannslakten/people');
  await expect(other.getByRole('combobox', { name: 'Family tree' })).toHaveValue('grannslakten');
  await fresh.close();

  // An address from before trees were in the path still lands somewhere real.
  await page.goto('/people?q=sven');
  await expect(page).toHaveURL(/\/[a-z-]+\/people\?q=sven$/);

  // leave the suite as it found it
  await page.goto('/wedin/settings');
  const cleanup = page.getByRole('listitem').filter({ hasText: 'Grannsläkten' });
  await cleanup.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  // Not a count: an earlier test leaves a tree of its own behind, so name the
  // one this test is responsible for.
  await expect(page.getByRole('combobox', { name: 'Family tree' })).not.toContainText('Grannsläkten');
});

/**
 * The suite must be talking to its own copy of the database. A browser test
 * that reaches the development API edits the real family records, and the only
 * sign is a row nobody put there — which is exactly what happened once.
 */
test('the suite runs against its own database, not the real one', async ({ request }) => {
  const { db } = await (await request.get('/api/health')).json();
  expect(db).toContain('.e2e');
  expect(db).not.toMatch(/[/\\]wedin-tree[/\\]wedin\.db$/);
});

test('a tree can be switched to GEDCOM 5.5.1 and it exports that way', async ({ page }) => {
  await page.goto('/wedin/settings');
  // Scoped to the Wedin row: every tree gets its own format select, and an
  // unscoped getByLabel would be ambiguous the moment a second tree exists.
  const row = page.getByRole('listitem').filter({ hasText: 'Wedin' });
  const select = row.getByLabel('GEDCOM export format');
  await expect(select).toHaveValue('7.0');            // default
  await select.selectOption('5.5.1');
  await expect(select).toHaveValue('5.5.1');
  const dl = await page.request.get('/api/export/gedcom?tree=wedin');
  expect(await dl.text()).toContain('2 VERS 5.5.1');

  // leave the suite as it found it — this tree's format is shared fixture state
  await select.selectOption('7.0');
  await expect(select).toHaveValue('7.0');
});
