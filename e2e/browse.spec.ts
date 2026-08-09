import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Runs against the real imported database; skip when it's absent.
test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('sök från Hem → personlista → personsida', async ({ page }) => {
  await page.goto('/wedin');
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
  // A surname with many bearers rather than one named person: the point is
  // that a row opens *its own* person, and naming a specific duplicate makes
  // the test rot the day that duplicate is merged.
  await page.goto('/wedin/personer?q=' + encodeURIComponent('Wedin'));
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);

  // The row's own first link, not one matched by name: a search matches
  // married names too, so the row shown need not read "Wedin" at all.
  const second = rows.nth(1);
  const personHref = await second.getByRole('link').first().getAttribute('href');
  const id = personHref!.split('/').pop()!;

  await second.getByRole('link', { name: 'Visa i träd' }).click();
  await expect(page).toHaveURL(new RegExp(`/trad/${id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  await expect(page.locator(`[data-tree-node="${id}"]`)).toBeVisible();
});

test('personsidans familjelänkar navigerar vidare', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');
  const familj = page.locator('section', { has: page.getByRole('heading', { name: 'Familj' }) });
  const firstLink = familj.getByRole('link').first();
  const name = await firstLink.textContent();
  await firstLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!.trim());
});

test('tangentbord: skip-länken hoppar till innehållet', async ({ page }) => {
  await page.goto('/wedin');
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

  const home = await measure('/wedin');
  for (const path of ['/personer', '/statistik', '/konsekvens', '/kallor', '/installningar'].map(x => `/wedin${x}`)) {
    const here = await measure(path);
    expect(here.nav, `sidhuvudet flyttade sig på ${path}`).toEqual(home.nav);
    expect(here.main, `innehållet bytte bredd på ${path}`).toEqual(home.main);
  }

  // Trädet är undantaget: det får hela fönstret — men sidhuvudet står kvar.
  const tree = await measure('/wedin/trad/I500001');
  expect(tree.nav).toEqual(home.nav);
  expect(tree.main[1]).toBeGreaterThan(home.main[1]!);
});

test('ett foto öppnas i större format och går att bläddra i', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  // Vänta in sidan innan miniatyrerna räknas — annars räknas skelettet.
  await expect(page.getByRole('heading', { name: 'Foton' })).toBeVisible();
  const thumbs = page.getByRole('button', { name: /i större format/ });
  await expect(thumbs.first()).toBeVisible();

  // Mät miniatyren först: när dialogen är öppen är sidan bakom den inert.
  const thumb = (await thumbs.first().boundingBox())!;

  await thumbs.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toBeVisible();

  const large = (await dialog.getByRole('img').boundingBox())!;
  expect(large.width).toBeGreaterThan(thumb.width);

  // Allt håller sig innanför rutan: bilden vägrar annars krympa och knuffar
  // ut bläddringspilarna ur dialogen.
  const box = (await dialog.boundingBox())!;
  expect(large.x + large.width).toBeLessThanOrEqual(box.x + box.width);
  for (const name of ['Föregående foto', 'Nästa foto']) {
    const arrow = await dialog.getByRole('button', { name }).boundingBox();
    if (!arrow) continue;                       // bara ett foto: inga pilar
    expect(arrow.x, `${name} utanför vänsterkanten`).toBeGreaterThanOrEqual(box.x);
    expect(arrow.x + arrow.width, `${name} utanför högerkanten`).toBeLessThanOrEqual(box.x + box.width);
  }

  // piltangenter bläddrar när det finns fler än ett
  const heading = dialog.getByRole('heading');
  const first = await heading.innerText();
  await page.keyboard.press('ArrowRight');
  if (await page.getByText(/\d+ av \d+|\d+ of \d+/).count()) {
    await expect(heading).not.toHaveText(first);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
