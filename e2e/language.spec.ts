import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('gränssnittet kan bytas till engelska, tyska och spanska', async ({ page }) => {
  await page.goto('/personer');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personer');

  const picker = page.getByRole('combobox', { name: /Språk|Language|Sprache|Idioma/ });

  await picker.selectOption('en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('People');
  await expect(page.getByRole('link', { name: 'Sources' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await picker.selectOption('de');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personen');
  await expect(page.getByRole('link', { name: 'Einstellungen' })).toBeVisible();

  await picker.selectOption('es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personas');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('språkvalet minns mellan besök och gäller alla sidor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: /Språk|Language|Sprache|Idioma/ }).selectOption('en');
  // exact: the header's import link is also named "…a family tree"
  await expect(page.getByRole('link', { name: 'Tree', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Tree', exact: true })).toBeVisible();

  // och på en helt annan sida
  await page.goto('/installningar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
  await expect(page.getByRole('link', { name: 'Download GEDCOM' })).toBeVisible();

  await page.goto('/trad/I500001?vy=fan');
  await expect(page.getByRole('button', { name: 'Fan', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Fan chart' })).toBeVisible();
});

test('händelser och datum översätts på personsidan', async ({ page }) => {
  await page.goto('/person/I500001');
  // scopa till tidslinjen: "Födelse" förekommer även i svensk källtext
  const timeline = page.locator('ol').first();
  await expect(timeline.getByText('Födelse').first()).toBeVisible();
  await expect(timeline.getByText('15 apr 1942').first()).toBeVisible();

  await page.getByRole('combobox', { name: /Språk|Language|Sprache|Idioma/ }).selectOption('en');
  await expect(timeline.getByText('Birth').first()).toBeVisible();
  await expect(timeline.getByText('15 Apr 1942').first()).toBeVisible();

  await page.getByRole('combobox', { name: /Språk|Language|Sprache|Idioma/ }).selectOption('de');
  await expect(timeline.getByText('Geburt').first()).toBeVisible();
});
