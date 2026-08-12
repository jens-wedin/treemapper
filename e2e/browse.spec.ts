import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Runs against the real imported database; skip when it's absent.
test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

test('search from Home → people list → person page', async ({ page }) => {
  await page.goto('/wedin');
  await page.getByLabel('Search for a person').fill('Sven-Erik Wedin');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/people\?q=/);
  await expect(page.getByText(/\d+ results?\b/)).toBeVisible();
  await page.getByRole('link', { name: /Sven-Erik Wedin/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
});

test('every search result can be opened straight in the tree', async ({ page }) => {
  // A surname with many bearers rather than one named person: the point is
  // that a row opens *its own* person, and naming a specific duplicate makes
  // the test rot the day that duplicate is merged.
  await page.goto('/wedin/people?q=' + encodeURIComponent('Wedin'));
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);

  // The row's own first link, not one matched by name: a search matches
  // married names too, so the row shown need not read "Wedin" at all.
  const second = rows.nth(1);
  const personHref = await second.getByRole('link').first().getAttribute('href');
  const id = personHref!.split('/').pop()!;

  await second.getByRole('link', { name: 'Show in tree' }).click();
  await expect(page).toHaveURL(new RegExp(`/tree/${id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tree');
  await expect(page.locator(`[data-tree-node="${id}"]`)).toBeVisible();
});

test('the person page\'s family links navigate onward', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');
  const familj = page.locator('section', { has: page.getByRole('heading', { name: 'Family' }) });
  const firstLink = familj.getByRole('link').first();
  const name = await firstLink.textContent();
  await firstLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!.trim());
});

test('keyboard: the skip link jumps to the content', async ({ page }) => {
  await page.goto('/wedin');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('the header stays still between tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });

  const measure = async (path: string) => {
    await page.goto(path);
    await page.getByRole('navigation').waitFor();
    const nav = (await page.getByRole('navigation').boundingBox())!;
    const main = (await page.locator('main').boundingBox())!;
    return { nav: [nav.x, nav.width], main: [main.x, main.width] };
  };

  const home = await measure('/wedin');
  for (const path of ['/people', '/statistics', '/issues', '/sources', '/settings'].map(x => `/wedin${x}`)) {
    const here = await measure(path);
    expect(here.nav, `the header moved on ${path}`).toEqual(home.nav);
    expect(here.main, `the content changed width on ${path}`).toEqual(home.main);
  }

  // The tree is the exception: it gets the whole window — but the header stays put.
  const tree = await measure('/wedin/tree/I500001');
  expect(tree.nav).toEqual(home.nav);
  expect(tree.main[1]).toBeGreaterThan(home.main[1]!);
});

test('a photo opens larger, and can be paged through', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  // Wait for the page before counting thumbnails — otherwise the skeleton is counted.
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  const thumbs = page.getByRole('button', { name: /larger/ });
  await expect(thumbs.first()).toBeVisible();

  // Measure the thumbnail first: with the dialog open, the page behind it is inert.
  const thumb = (await thumbs.first().boundingBox())!;

  await thumbs.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toBeVisible();

  const large = (await dialog.getByRole('img').boundingBox())!;
  expect(large.width).toBeGreaterThan(thumb.width);

  // Everything stays inside the box: otherwise the image refuses to shrink and pushes
  // the paging arrows out of the dialog.
  const box = (await dialog.boundingBox())!;
  expect(large.x + large.width).toBeLessThanOrEqual(box.x + box.width);
  for (const name of ['Previous photo', 'Next photo']) {
    const arrow = await dialog.getByRole('button', { name }).boundingBox();
    if (!arrow) continue;                       // bara ett foto: inga pilar
    expect(arrow.x, `${name} is past the left edge`).toBeGreaterThanOrEqual(box.x);
    expect(arrow.x + arrow.width, `${name} is past the right edge`).toBeLessThanOrEqual(box.x + box.width);
  }

  // arrow keys page through when there is more than one
  const heading = dialog.getByRole('heading');
  const first = await heading.innerText();
  await page.keyboard.press('ArrowRight');
  if (await page.getByText(/\d+ av \d+|\d+ of \d+/).count()) {
    await expect(heading).not.toHaveText(first);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
