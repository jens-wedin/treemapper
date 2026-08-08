import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Runs against the real imported database; skip when it's absent.
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('sök från Hem → personlista → personsida', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Sök person').fill('Sven-Erik Wedin');
  await page.getByRole('button', { name: 'Sök' }).click();
  await expect(page).toHaveURL(/\/personer\?q=/);
  await expect(page.getByText(/träffar/)).toBeVisible();
  await page.getByRole('link', { name: /Sven-Erik Wedin/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');
  await expect(page.getByRole('heading', { name: 'Händelser' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Familj' })).toBeVisible();
});

test('varje sökträff går att öppna direkt i trädet', async ({ page }) => {
  await page.goto('/personer?q=' + encodeURIComponent('Anders Bergqvist'));
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();

  // två poster delar namn och årtal — raden måste öppna sin egen person
  const second = rows.nth(1);
  const personHref = await second.getByRole('link', { name: /Anders Bergqvist/ }).getAttribute('href');
  const id = personHref!.split('/').pop()!;

  await second.getByRole('link', { name: 'Visa i träd' }).click();
  await expect(page).toHaveURL(new RegExp(`/trad/${id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  await expect(page.locator(`[data-tree-node="${id}"]`)).toBeVisible();
});

test('personsidans familjelänkar navigerar vidare', async ({ page }) => {
  await page.goto('/person/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');
  const familj = page.locator('section', { has: page.getByRole('heading', { name: 'Familj' }) });
  const firstLink = familj.getByRole('link').first();
  const name = await firstLink.textContent();
  await firstLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!.trim());
});

test('tangentbord: skip-länken hoppar till innehållet', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Hoppa till innehåll' })).toBeFocused();
});

test('sidhuvudet står stilla mellan flikarna', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });

  const measure = async (path: string) => {
    await page.goto(path);
    await page.getByRole('navigation').waitFor();
    const nav = (await page.getByRole('navigation').boundingBox())!;
    const main = (await page.locator('main').boundingBox())!;
    return { nav: [nav.x, nav.width], main: [main.x, main.width] };
  };

  const home = await measure('/');
  for (const path of ['/personer', '/statistik', '/konsekvens', '/kallor', '/installningar']) {
    const here = await measure(path);
    expect(here.nav, `sidhuvudet flyttade sig på ${path}`).toEqual(home.nav);
    expect(here.main, `innehållet bytte bredd på ${path}`).toEqual(home.main);
  }

  // Trädet är undantaget: det får hela fönstret — men sidhuvudet står kvar.
  const tree = await measure('/trad/I500001');
  expect(tree.nav).toEqual(home.nav);
  expect(tree.main[1]).toBeGreaterThan(home.main[1]!);
});
