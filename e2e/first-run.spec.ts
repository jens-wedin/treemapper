import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * What somebody sees who has just cloned this repository.
 *
 * Runs in its own Playwright project, against its own server on an empty
 * `.first-run/` directory — the main suite starts from a copy of a populated
 * database and so can never reach this state. `global-setup.ts` empties the
 * directory before every run.
 *
 * The bug being guarded against: `wedin.db` used to be written to disk as a
 * side effect of asking whether it existed, so a stranger was handed an empty
 * family tree named after somebody else's family.
 */
const FRESH = '.first-run';

test.describe.configure({ mode: 'serial' });

test('offers to import or to start from nothing, and has made no database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'No family tree yet', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import a family tree' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create an empty family tree' })).toBeVisible();

  // No navigation, because every address it could offer names a tree that is
  // not there. The picker is gone for the same reason.
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Family tree' })).toHaveCount(0);

  expect(fs.existsSync(path.join(FRESH, 'family.db'))).toBe(false);
});

test('names the first database after the tree, and lands in it', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Name of the new family tree').fill('Mormors släkt');
  await page.getByRole('button', { name: 'Create an empty family tree' }).click();

  await expect(page).toHaveURL(/\/mormors-slakt\//);
  // Swedish letters folded, so the id is safe in a path and in a filename.
  expect(fs.existsSync(path.join(FRESH, 'trees', 'mormors-slakt.db'))).toBe(true);
  expect(fs.existsSync(path.join(FRESH, 'family.db'))).toBe(false);

  // The app is itself again: navigation back, and the tree it just made open.
  await expect(page.getByRole('navigation').getByRole('link')).not.toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Family tree' })).toHaveValue('mormors-slakt');
});

test('the new tree is empty and the first person can be added', async ({ page }) => {
  await page.goto('/mormors-slakt/people');
  await expect(page.getByText('0 results')).toBeVisible();

  await page.getByRole('button', { name: 'New person' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('First name').fill('Karin');
  await dialog.getByLabel('Surname').fill('Mormorsdotter');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\/mormors-slakt\/person\/I1$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Karin Mormorsdotter');
});

test('an imported tree is named after itself too', async ({ page }) => {
  await page.goto('/mormors-slakt/settings');

  await page.getByLabel('GEDCOM file').setInputFiles('lib/gedcom/fixtures/mini.ged');
  await page.getByLabel('Name of the family tree').fill('Farfars gren');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page.getByText(/3/).first()).toBeVisible();
  expect(fs.existsSync(path.join(FRESH, 'trees', 'farfars-gren.db'))).toBe(true);
  expect(fs.existsSync(path.join(FRESH, 'family.db'))).toBe(false);
});
