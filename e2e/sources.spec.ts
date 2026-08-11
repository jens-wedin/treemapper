import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating test (källredigering) — runs against the .e2e.db copy.
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('källistan söker och leder till källsidan', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Källor');
  await expect(page.getByText(/\d+ träff(ar)?\b/)).toBeVisible();

  const firstLink = page.locator('tbody tr').first().getByRole('link');
  const title = (await firstLink.textContent())!.trim();
  await firstLink.click();

  await expect(page).toHaveURL(/\/kalla\/S\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title.slice(0, 20));
  await expect(page.getByRole('heading', { name: /Källhänvisningar/ })).toBeVisible();
});

test('källhänvisning länkar till personen', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await page.locator('tbody tr').first().getByRole('link').click();
  const citationLink = page.locator('ul > li').first().getByRole('link').first();
  await expect(citationLink).toBeVisible();
  await citationLink.click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

test('redigera en källas titel', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await page.locator('tbody tr').first().getByRole('link').click();
  await page.getByRole('button', { name: 'Redigera' }).click();
  await page.getByLabel('Namn').fill('Testkälla redigerad');
  await page.getByRole('button', { name: 'Spara' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testkälla redigerad');
});

test('personsidans källhänvisning länkar till källan', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  // Contains, not starts-with: every link now begins with its tree.
  const sourceLink = page.locator('a[href*="/kalla/"]').first();
  await expect(sourceLink).toBeVisible();
  const title = (await sourceLink.textContent())!.trim();
  await sourceLink.click();
  await expect(page).toHaveURL(/\/kalla\/S\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title.slice(0, 20));
});

test('inställningar erbjuder gedcom-nedladdning', async ({ page }) => {
  await page.goto('/wedin/installningar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Inställningar');
  // The link names the tree it exports, so what you downloaded is never a guess.
  const link = page.getByRole('link', { name: 'Ladda ner GEDCOM' });
  await expect(link).toHaveAttribute('href', '/api/export/gedcom?tree=wedin');

  // hämta filen och kontrollera att den ser ut som GEDCOM
  const res = await page.request.get('/api/export/gedcom');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain('.ged');
  const body = await res.text();
  expect(body.replace(/^﻿/, '').startsWith('0 HEAD')).toBe(true);
  expect(body).toContain('2 VERS 5.5.1');
  expect(body.trimEnd().endsWith('0 TRLR')).toBe(true);
});

/**
 * A source's own words and a remark about it are different things: the
 * transcription is what the document says, the note is what you say about it.
 */
test('en källa kan skrivas av, med anteckningen som eget fält', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await page.locator('tbody tr').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/kalla\/S\d+/);

  await page.getByRole('button', { name: 'Redigera' }).click();
  const doc = 'Pardevant moy soubsigné\n\nErik Nilsson maistre marteleur';
  await page.getByLabel('Transkription').fill(doc);
  await page.getByLabel('Anteckning').fill('Jämför med originalet i RA.');
  await page.getByRole('button', { name: 'Spara' }).click();

  // Shown as two separate sections, and the blank line is still a blank line.
  const shown = page.getByRole('heading', { name: 'Transkription' })
    .locator('xpath=following-sibling::*[1]');
  await expect(shown).toContainText('Pardevant moy');
  await expect(shown).toContainText('Erik Nilsson');
  // Line breaks are where the lines break on the page, so the block keeps its
  // own shape instead of reflowing as prose.
  await expect(shown).toHaveCSS('white-space', 'pre-wrap');
  await expect(page.getByRole('heading', { name: 'Anteckning' })).toBeVisible();

  // survives a reload — it is in the database, not in the form
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Transkription' })).toBeVisible();
  await expect(page.getByText('Erik Nilsson')).toBeVisible();
});

test('en ny källa skapas och leder direkt till transkriptionen', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await page.getByRole('button', { name: 'Ny källa' }).click();
  await page.getByRole('dialog').getByLabel('Namn').fill('Notarialakt, Hinspont 1618');
  await page.getByRole('dialog').getByRole('button', { name: 'Spara' }).click();

  // lands on the new source, where the transcription field lives
  await expect(page).toHaveURL(/\/wedin\/kalla\/S\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Notarialakt, Hinspont 1618');
  await page.getByRole('button', { name: 'Redigera' }).click();
  await expect(page.getByLabel('Transkription')).toBeVisible();

  // and it is in the list afterwards
  await page.goto('/wedin/kallor?q=' + encodeURIComponent('Notarialakt, Hinspont'));
  await expect(page.getByRole('link', { name: /Notarialakt, Hinspont 1618/ })).toBeVisible();
});

test('en källa går att ta bort, och säger vad det kostar', async ({ page }) => {
  // one we made ourselves, so nothing in the tree leans on it
  await page.goto('/wedin/kallor');
  await page.getByRole('button', { name: 'Ny källa' }).click();
  await page.getByRole('dialog').getByLabel('Namn').fill('Att kasta bort');
  await page.getByRole('dialog').getByRole('button', { name: 'Spara' }).click();
  await expect(page).toHaveURL(/\/kalla\/S\d+$/);

  await page.getByRole('button', { name: 'Ta bort källa' }).click();
  const box = page.getByRole('alertdialog');
  await expect(box).toContainText('Att kasta bort');
  await expect(box).toContainText(/Inget hänvisar/);
  await box.getByRole('button', { name: 'Ta bort källa' }).click();

  await expect(page).toHaveURL(/\/wedin\/kallor$/);
  await page.goto('/wedin/kallor?q=' + encodeURIComponent('Att kasta bort'));
  await expect(page.getByRole('link', { name: 'Att kasta bort' })).toHaveCount(0);
});

test('en citerad källa säger hur många hänvisningar som följer med', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await page.locator('tbody tr').first().getByRole('link').click();
  await page.getByRole('button', { name: 'Ta bort källa' }).click();
  // The number is in the confirmation, not discovered afterwards.
  await expect(page.getByRole('alertdialog')).toContainText(/\d+ källhänvisningar/);
  await page.getByRole('button', { name: 'Avbryt' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
