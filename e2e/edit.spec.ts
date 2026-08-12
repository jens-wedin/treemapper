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
  await page.getByLabel(/^Date/).fill('ABT 1970');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Testyrke')).toBeVisible();
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
  await family.getByRole('button', { name: /Add marriage|Edit/ }).first().click();
  await page.getByLabel(/Date/).fill('14 JUN 1969');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(family.getByText('14 Jun 1969')).toBeVisible();

  // and it sits on the family, not the person: the person's event list
  // holds no marriage
  const timeline = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await expect(timeline.getByText('Marriage')).toHaveCount(0);
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
