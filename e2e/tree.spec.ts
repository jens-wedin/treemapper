import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('trädet renderas och piltangenter flyttar fokus', async ({ page }) => {
  await page.goto('/trad/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  const focusNode = page.locator('[data-tree-node="I500001"]');
  await expect(focusNode).toBeVisible();
  await focusNode.focus();
  await expect(focusNode).toBeFocused();   // vänta in renderingen innan tangenttryck
  await page.keyboard.press('ArrowUp');    // I500001 har 2 föräldrar
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('klick på ett kort öppnar personpanelen', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.locator('[data-tree-node="I500001"]').click();
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
  await expect(panel.getByRole('heading', { name: 'Familj' })).toBeVisible();
  // panelen stängs med Escape
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('panelen kan fokusera om trädet och öppna personsidan', async ({ page }) => {
  await page.goto('/trad/I500001');
  // Enter på ett kort öppnar panelen
  const start = page.locator('[data-tree-node="I500001"]');
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Fokusera trädet här' }).click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)I\d+/);
  await expect(panel).toBeHidden();

  await page.locator('[data-tree-node]').first().click();
  await page.getByRole('complementary', { name: 'Personuppgifter' })
    .getByRole('link', { name: 'Gå till personsida' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

test('antavlan visar förfäder men inga ättlingar', async ({ page }) => {
  await page.goto('/trad/I500003?upp=3&ned=2');
  await page.getByRole('button', { name: 'Antavla', exact: true }).click();
  await expect(page).toHaveURL(/vy=pedigree/);
  await expect(page.getByRole('group', { name: 'Antavla' })).toBeVisible();

  // fokuspersonen och hans far finns med
  await expect(page.locator('[data-tree-node="I500003"]')).toBeVisible();
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();

  // inga ättlingar — hämta barnen ur API:et i stället för att gissa id:n
  const tree = await (await page.request.get('/api/tree/I500003?up=0&down=1')).json();
  const childIds: string[] = tree.descendants.children.map((c: { person: { id: string } }) => c.person.id);
  expect(childIds.length).toBeGreaterThan(0);
  for (const id of childIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toHaveCount(0);
  }
  await expect(page.getByText('Antavla och solfjäder visar bara förfäder.')).toBeVisible();
});

test('antavlan kan visa fler än fem generationer', async ({ page }) => {
  await page.goto('/trad/I500003?upp=3&vy=pedigree');
  await expect(page.locator('[data-tree-node]').first()).toBeVisible();
  const atFive = await page.locator('[data-tree-node]').count();

  const generations = page.getByLabel('Generationer uppåt');
  await generations.selectOption('7');
  await expect(generations).toHaveValue('7');        // får inte studsa tillbaka
  await expect(page).toHaveURL(/upp=7/);
  await expect
    .poll(() => page.locator('[data-tree-node]').count())
    .toBeGreaterThan(atFive);

  // och valet överlever en omladdning
  await page.reload();
  await expect(page.getByLabel('Generationer uppåt')).toHaveValue('7');
});

test('solfjädern renderas och kan navigeras med tangentbord', async ({ page }) => {
  await page.goto('/trad/I500003?upp=4&vy=fan');
  await expect(page.getByRole('group', { name: 'Solfjäder' })).toBeVisible();
  const slices = page.locator('[data-tree-node]');
  await expect(slices.first()).toBeVisible();
  expect(await slices.count()).toBeGreaterThan(5);

  // piltangent flyttar fokus mellan skivor — fråga DOM:en var fokus hamnade
  // i stället för att läsa tabindex, som släpar en rendering efter
  const first = page.locator('[data-tree-node="I500001"]');
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('personpanelen fungerar i både antavla och solfjäder', async ({ page }) => {
  for (const [view, label] of [['pedigree', 'Antavla'], ['fan', 'Solfjäder']] as const) {
    await page.goto(`/trad/I500003?upp=3&vy=${view}`);
    await expect(page.getByRole('group', { name: label })).toBeVisible();
    // klicka på etiketten: en skivas bounding box har sin mittpunkt inne i
    // solfjäderns navcirkel, så ett klick "mitt på" elementet träffar navet
    await page.locator('[data-tree-node="I500001"] text').first().click();
    const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
    await page.keyboard.press('Escape');
  }
});

test('listvyn är en likvärdig väg och kan fokusera om trädet', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('heading', { name: 'Förfäder' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ättlingar' })).toBeVisible();
  // :has(> h2 …) — only the inner list section, not the page-level <section> that also contains the heading
  const ancestorSection = page.locator('section:has(> h2:text-is("Förfäder"))');
  await ancestorSection.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)/);
});

test('personsidan länkar till trädet', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('link', { name: 'Visa i träd' }).click();
  await expect(page).toHaveURL(/\/trad\/I500001/);
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();
});
