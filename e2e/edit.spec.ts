import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating tests — these run against the .e2e.db copy (see e2e/global-setup.ts).
test.skip(!fs.existsSync('wedin.db'), 'wedin.db is missing — run npm run import first');

test('edit a person\'s fields', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Married name').fill('Teständring');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Teständring');
});

test('add an event', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Type').selectOption('OCCU');
  await page.getByLabel('Description').fill('Testyrke');
  await page.getByLabel('Kind of date').selectOption('about');
  await page.getByLabel('Year', { exact: true }).fill('1970');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Testyrke')).toBeVisible();
});

test('a date is entered as its parts, and shows what it will become', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Type').selectOption('OCCU');
  await page.getByLabel('Description').fill('Datumtest');

  // A year on its own is a real genealogical date, so day and month stay empty.
  await page.getByLabel('Year', { exact: true }).fill('1902');
  await expect(page.getByText('Stored as: 1902')).toBeVisible();

  await page.getByLabel('Month', { exact: true }).selectOption('3');
  await expect(page.getByText('Stored as: MAR 1902')).toBeVisible();

  // Between reveals the second half and reads out in words.
  await page.getByLabel('Kind of date').selectOption('between');
  await page.getByLabel('End year').fill('1910');
  await expect(page.getByText('Stored as: BET MAR 1902 AND 1910')).toBeVisible();
  await expect(page.getByText('Reads as: between Mar 1902 and 1910')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('li').filter({ hasText: 'Datumtest' });
  await expect(row).toContainText('between Mar 1902 and 1910');

  // Tidy up: an occupation in 1902 for a man born in 1942 is a genuine
  // inconsistency, and later specs rely on this person having none.
  await row.getByRole('button', { name: /^Remove/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
});

test('an impossible date is refused rather than stored', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Type').selectOption('OCCU');

  await page.getByLabel('Day', { exact: true }).fill('31');
  await page.getByLabel('Month', { exact: true }).selectOption('2');
  await page.getByLabel('Year', { exact: true }).fill('1902');

  await expect(page.getByRole('alert')).toContainText('does not have that many days');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  // and a real day in that month clears it again
  await page.getByLabel('Day', { exact: true }).fill('28');
  await expect(page.getByText('Stored as: 28 FEB 1902')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('a date the form cannot hold is kept exactly as written', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Type').selectOption('DEAT');
  await page.getByLabel('Description').fill('Fritextdatum');

  await page.getByRole('button', { name: 'Type it myself' }).click();
  await page.getByLabel('Date', { exact: true }).fill('INFANT');
  await expect(page.getByText('Kept exactly as written', { exact: false })).toBeVisible();
  // The boxes must not pretend they can hold it.
  await expect(page.getByLabel('Kind of date')).toBeDisabled();

  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('li').filter({ hasText: 'Fritextdatum' });
  await expect(row).toContainText('INFANT');

  // Tidy up: a second death is a problem in its own right, and later specs
  // rely on this person having none.
  await row.getByRole('button', { name: /^Remove/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
});

test('add a child through the dialog', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add child' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Create a new person').check();
  await dialog.getByLabel('First name').fill('Testbarn');
  await dialog.getByLabel('Surname').fill('Wedin');
  const familySelect = dialog.getByLabel('Family');
  if (await familySelect.isVisible()) await familySelect.selectOption({ index: 0 });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Testbarn/ })).toBeVisible();
});

test('removing asks in the app\'s own dialog, and can be backed out of', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Type').selectOption('OCCU');
  await page.getByLabel('Description').fill('Ska tas bort');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('li').filter({ hasText: 'Ska tas bort' });
  await expect(row).toBeVisible();

  // The row's controls are icons, so each one has to say which event it acts on
  await expect(row.getByRole('button', { name: 'Edit Occupation' })).toBeVisible();

  // Cancel leaves the event alone
  await row.getByRole('button', { name: 'Remove Occupation' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Remove this event?');
  await expect(confirm).toContainText('Occupation');            // which event it concerns
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Remove Occupation' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
});

test('every section offers its add button on the heading line', async ({ page }) => {
  await page.goto('/wedin/person/I500001');

  for (const [heading, button] of [
    ['Events', 'Add event'],
    ['Family', 'Add child'],
    ['Citations', 'Add citation'],
  ]) {
    const section = page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) });
    const title = await section.getByRole('heading', { name: heading, exact: true }).boundingBox();
    const add = await section.getByRole('button', { name: button }).boundingBox();
    // Same line as the heading, not further down the section.
    expect(Math.abs(add!.y - title!.y), `${button} beside ${heading}`).toBeLessThan(24);
  }
});

test('the person page ends with its change history', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  const log = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Change history' }) });
  await expect(log).toBeVisible();

  // last on the page
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings[headings.length - 1]).toBe('Change history');

  // the earlier tests in this file have already edited I500001
  await expect(log.locator('ol > li').first()).toContainText(/\d\d\/\d\d\/20\d\d/);
  await expect(log).toContainText('married name');
});

test('a marriage is added to the family, not to the person', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();

  // Marriage is not among a person's event types — it belongs to the couple.
  await page.getByRole('button', { name: 'Add event' }).click();
  const types = await page.getByLabel('Type').locator('option').allInnerTexts();
  expect(types).not.toContain('Marriage');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // … but is edited in the family box, and saved on the family
  const family = page.locator('section', { has: page.getByRole('heading', { name: 'Family' }) });
  // Anchored, so that renaming the control is noticed rather than shrugged at.
  await family.getByRole('button', { name: /^(Add marriage|Edit Marriage)/ }).first().click();
  await page.getByLabel('Day', { exact: true }).fill('14');
  await page.getByLabel('Month', { exact: true }).selectOption('6');
  await page.getByLabel('Year', { exact: true }).fill('1969');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(family.getByText('14 Jun 1969')).toBeVisible();

  // and it sits on the family, not the person: the person's event list
  // holds no marriage
  const timeline = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await expect(timeline.getByText('Marriage')).toHaveCount(0);
});

test('a marriage can be removed again, through the icon on its row', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  const family = page.locator('section', { has: page.getByRole('heading', { name: 'Family', exact: true }) });

  // the previous test left this one on the first family
  await expect(family.getByText('14 Jun 1969')).toBeVisible();

  // The icon has to say which marriage it is about — there are two families here.
  await family.getByRole('button', { name: 'Remove Marriage 14 Jun 1969' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Remove the marriage?');
  await confirm.getByRole('button', { name: 'Remove' }).click();

  await expect(family.getByText('14 Jun 1969')).toHaveCount(0);
  await expect(family.getByRole('button', { name: 'Add marriage' }).first()).toBeVisible();
});

test('a photo can be added and removed again', async ({ page }) => {
  // a person with no photos, so the count is unambiguous
  await page.goto('/wedin/person/I500616');
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  const thumbs = page.getByRole('button', { name: /larger/ });
  const before = await thumbs.count();

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Add photo').setInputFiles({ name: 'farmor.png', mimeType: 'image/png', buffer: pixel });
  await expect(thumbs).toHaveCount(before + 1);

  // the filename becomes the title, and the photo can be opened
  await thumbs.last().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toContainText('farmor');

  // and removed again — behind a confirmation
  await dialog.getByRole('button', { name: 'Remove photo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove photo' }).click();
  await expect(thumbs).toHaveCount(before);
});
