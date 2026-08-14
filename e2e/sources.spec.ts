import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating test (source editing) — runs against the .e2e.db copy.
test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

test('the source list searches, and leads to the source page', async ({ page }) => {
  await page.goto('/wedin/sources');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sources');
  await expect(page.getByText(/\d+ results?\b/)).toBeVisible();

  const firstLink = page.locator('tbody tr').first().getByRole('link');
  const title = (await firstLink.textContent())!.trim();
  await firstLink.click();

  await expect(page).toHaveURL(/\/source\/S\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title.slice(0, 20));
  await expect(page.getByRole('heading', { name: /Citations/ })).toBeVisible();
});

test('a citation links to the person', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.locator('tbody tr').first().getByRole('link').click();
  const citationLink = page.locator('ul > li').first().getByRole('link').first();
  await expect(citationLink).toBeVisible();
  await citationLink.click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

test('edit a source\'s title', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.locator('tbody tr').first().getByRole('link').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill('Testkälla redigerad');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testkälla redigerad');
});

test('the person page\'s citation links to the source', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  // Contains, not starts-with: every link now begins with its tree.
  const sourceLink = page.locator('a[href*="/source/"]').first();
  await expect(sourceLink).toBeVisible();
  const title = (await sourceLink.textContent())!.trim();
  await sourceLink.click();
  await expect(page).toHaveURL(/\/source\/S\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title.slice(0, 20));
});

test('settings offers a GEDCOM download', async ({ page }) => {
  await page.goto('/wedin/settings');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
  // The link names the tree it exports, so what you downloaded is never a guess.
  const link = page.getByRole('link', { name: 'Download GEDCOM' });
  await expect(link).toHaveAttribute('href', '/api/export/gedcom?tree=wedin');

  // fetch the file and check that it looks like GEDCOM
  const res = await page.request.get('/api/export/gedcom');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain('.ged');
  const body = await res.text();
  expect(body.replace(/^﻿/, '').startsWith('0 HEAD')).toBe(true);
  expect(body).toMatch(/2 VERS (5\.5\.1|7\.0)/);   // the tree's configured format (7.0 by default)
  expect(body.trimEnd().endsWith('0 TRLR')).toBe(true);
});

/**
 * A source's own words and a remark about it are different things: the
 * transcription is what the document says, the note is what you say about it.
 */
test('a source can be transcribed, with the note as its own field', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.locator('tbody tr').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/source\/S\d+/);

  await page.getByRole('button', { name: 'Edit' }).click();
  const doc = 'Pardevant moy soubsigné\n\nErik Nilsson maistre marteleur';
  await page.getByLabel('Transcription').fill(doc);
  await page.getByLabel('Note').fill('Jämför med originalet i RA.');
  await page.getByRole('button', { name: 'Save' }).click();

  // Shown as two separate sections, and the blank line is still a blank line.
  const shown = page.getByRole('heading', { name: 'Transcription' })
    .locator('xpath=following-sibling::*[1]');
  await expect(shown).toContainText('Pardevant moy');
  await expect(shown).toContainText('Erik Nilsson');
  // Line breaks are where the lines break on the page, so the block keeps its
  // own shape instead of reflowing as prose.
  await expect(shown).toHaveCSS('white-space', 'pre-wrap');
  await expect(page.getByRole('heading', { name: 'Note' })).toBeVisible();

  // survives a reload — it is in the database, not in the form
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Transcription' })).toBeVisible();
  await expect(page.getByText('Erik Nilsson')).toBeVisible();
});

test('a new source is created and leads straight to the transcription', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.getByRole('button', { name: 'New source' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Notarialakt, Hinspont 1618');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

  // lands on the new source, where the transcription field lives
  await expect(page).toHaveURL(/\/wedin\/source\/S\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Notarialakt, Hinspont 1618');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Transcription')).toBeVisible();

  // and it is in the list afterwards
  await page.goto('/wedin/sources?q=' + encodeURIComponent('Notarialakt, Hinspont'));
  await expect(page.getByRole('link', { name: /Notarialakt, Hinspont 1618/ })).toBeVisible();
});

test('a source can be deleted, and says what that costs', async ({ page }) => {
  // one we made ourselves, so nothing in the tree leans on it
  await page.goto('/wedin/sources');
  await page.getByRole('button', { name: 'New source' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Att kasta bort');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/source\/S\d+$/);

  await page.getByRole('button', { name: 'Delete source' }).click();
  const box = page.getByRole('alertdialog');
  await expect(box).toContainText('Att kasta bort');
  await expect(box).toContainText(/Nothing cites/);
  await box.getByRole('button', { name: 'Delete source' }).click();

  await expect(page).toHaveURL(/\/wedin\/sources$/);
  await page.goto('/wedin/sources?q=' + encodeURIComponent('Att kasta bort'));
  await expect(page.getByRole('link', { name: 'Att kasta bort' })).toHaveCount(0);
});

test('a cited source says how many citations go with it', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.locator('tbody tr').first().getByRole('link').click();
  await page.getByRole('button', { name: 'Delete source' }).click();
  // The number is in the confirmation, not discovered afterwards.
  await expect(page.getByRole('alertdialog')).toContainText(/cited \d+ times/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

/**
 * The link between a document and the people it names — the step that turns a
 * transcription into genealogy. Both directions, because you approach it from
 * both: holding the document, or researching the person.
 */
test('a source is tied to a person from the source\'s own page', async ({ page }) => {
  await page.goto('/wedin/sources');
  await page.getByRole('button', { name: 'New source' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('vigselakten');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/source\/S\d+$/);

  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Add person').fill('Sven-Erik');
  // PersonSearch searches on submit, not while typing.
  await page.getByLabel('Add person').press('Enter');
  await page.getByRole('button', { name: /Sven-Erik Wedin/ }).first().click();
  await page.getByLabel('Quotation').fill('Erik Nilsson maistre marteleur');
  await page.getByLabel('Quality').selectOption('3');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: /Sven-Erik Wedin/ })).toBeVisible();
  await expect(page.getByText('Erik Nilsson maistre marteleur')).toBeVisible();

  // and it shows on the person's own page
  await page.getByRole('link', { name: /Sven-Erik Wedin/ }).first().click();
  await expect(page.getByRole('link', { name: 'vigselakten' })).toBeVisible();

  // untying it leaves the source standing. Target the row for *this* source:
  // Sven-Erik already carries citations from the import.
  const row = page.locator('li').filter({ has: page.getByRole('link', { name: 'vigselakten' }) });
  await row.getByRole('button', { name: 'Remove citation' }).click();
  await expect(page.getByRole('link', { name: 'vigselakten' })).toHaveCount(0);
  await page.goto('/wedin/sources?q=vigselakten');
  await expect(page.getByRole('link', { name: 'vigselakten' })).toBeVisible();
});
