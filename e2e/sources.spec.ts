import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating test (källredigering) — runs against the .e2e.db copy.
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('källistan söker och leder till källsidan', async ({ page }) => {
  await page.goto('/wedin/kallor');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Källor');
  await expect(page.getByText(/träffar/)).toBeVisible();

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
