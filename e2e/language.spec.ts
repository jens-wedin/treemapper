import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db is missing — run npm run import first');

/**
 * English is the source language now, so the interesting direction is the other
 * one: this suite used to prove the app could be switched *to* English, and the
 * Swedish it started in was never checked at all.
 */
const PICKER = /Language|Språk|Sprache|Idioma/;

test('the interface can be switched to Swedish, German and Spanish', async ({ page }) => {
  await page.goto('/wedin/people');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('People');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const picker = page.getByRole('combobox', { name: PICKER });

  await picker.selectOption('sv');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personer');
  await expect(page.getByRole('link', { name: 'Källor' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv');

  await picker.selectOption('de');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personen');
  await expect(page.getByRole('link', { name: 'Einstellungen' })).toBeVisible();

  await picker.selectOption('es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personas');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the language choice is remembered between visits, on every page', async ({ page }) => {
  await page.goto('/wedin');
  await page.getByRole('combobox', { name: PICKER }).selectOption('sv');
  // exact, so the nav link is not confused with anything merely containing it
  await expect(page.getByRole('link', { name: 'Träd', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Träd', exact: true })).toBeVisible();

  // and on a completely different page
  await page.goto('/wedin/settings');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Inställningar');
  await expect(page.getByRole('link', { name: 'Ladda ner GEDCOM' })).toBeVisible();

  await page.goto('/wedin/tree/I500001?view=fan');
  await expect(page.getByRole('tab', { name: 'Solfjäder', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Solfjäder' })).toBeVisible();
});

test('the Swedish translation is complete enough to read a whole page', async ({ page }) => {
  // A key missing from sv falls back to English, which would show up here as a
  // stray English word among the Swedish.
  await page.goto('/wedin/people');
  await page.getByRole('combobox', { name: PICKER }).selectOption('sv');

  for (const label of ['Hem', 'Personer', 'Träd', 'Statistik', 'Konsekvens', 'Källor', 'Inställningar']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Sök' })).toBeVisible();
});

test('events and dates are translated on the person page', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  // scoped to the timeline: "Birth" also appears in the Swedish source text
  const timeline = page.locator('ol').first();
  await expect(timeline.getByText('Birth').first()).toBeVisible();
  await expect(timeline.getByText('15 Apr 1942').first()).toBeVisible();

  await page.getByRole('combobox', { name: PICKER }).selectOption('sv');
  await expect(timeline.getByText('Födelse').first()).toBeVisible();
  await expect(timeline.getByText('15 apr 1942').first()).toBeVisible();

  await page.getByRole('combobox', { name: PICKER }).selectOption('de');
  await expect(timeline.getByText('Geburt').first()).toBeVisible();
});
