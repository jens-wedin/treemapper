import { test, expect } from '@playwright/test';

test('the statistics page is reached from the menu and shows all four sections', async ({ page }) => {
  await page.goto('/wedin');
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page).toHaveURL(/\/statistics/);
  for (const heading of ['Lives and lifespans', 'Names', 'Families', 'Places and work']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('every chart has its numbers as a table too', async ({ page }) => {
  await page.goto('/wedin/statistics');
  await expect(page.getByRole('heading', { name: 'Lives and lifespans' })).toBeVisible();
  // two charts under Lives, one under Families — each with a table below
  await expect.poll(() => page.getByRole('table').count()).toBe(3);
});

test('impossible ages are not presented as fun facts', async ({ page }) => {
  await page.goto('/wedin/statistics');
  await expect(page.getByText(/Ages over 110 are treated as data errors/)).toBeVisible();
  const ages = await page.locator('ol li', { hasText: /\d+ years$/ }).allInnerTexts();
  for (const row of ages) {
    const age = Number(/(\d+) years$/.exec(row.trim())?.[1] ?? 0);
    expect(age).toBeLessThanOrEqual(110);
  }
});

test('narrowing to one person lands in the URL and survives a reload', async ({ page }) => {
  await page.goto('/wedin/statistics');
  await expect(page.getByRole('heading', { name: 'Lives and lifespans' })).toBeVisible();
  // the first card in the first <dl> is the number of people; "People" as text
  // also appears in the menu, so aim at the card instead
  const peopleCard = page.locator('dl').first().locator('div').first();
  const everyone = await peopleCard.innerText();

  await page.getByLabel('Choose a person').fill('Sven-Erik Wedin');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /Sven-Erik Wedin/ }).first().click();

  await expect(page).toHaveURL(/person=I\d+/);
  await expect(page.getByText(/Statistics for Sven-Erik Wedin/)).toBeVisible();
  // siffrorna ska faktiskt ha smalnat av, inte bara rubriken
  await expect.poll(() => peopleCard.innerText()).not.toBe(everyone);

  await page.reload();
  await expect(page.getByText(/Statistics for Sven-Erik Wedin/)).toBeVisible();

  await page.getByRole('button', { name: 'Show the whole tree' }).click();
  await expect(page).not.toHaveURL(/person=/);
  await expect.poll(() => peopleCard.innerText()).toBe(everyone);
});

/**
 * Every list on this page answers a question that provokes the next one — who
 * *was* the person who lived to 104? The name has to be the way there.
 */
test('namnen i statistiken leder till personsidan', async ({ page }) => {
  await page.goto('/wedin/statistics');

  const longest = page.locator('h3', { hasText: /Longest lives/ })
    .locator('xpath=following-sibling::ol[1]');
  const first = longest.getByRole('link').first();
  await expect(first).toBeVisible();
  const name = (await first.textContent())!.trim();

  await first.click();
  await expect(page).toHaveURL(/\/wedin\/person\/I\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

  // and the couples in Largest families link each partner on their own
  await page.goto('/wedin/statistics');
  const families = page.locator('h3', { hasText: /Largest families/ })
    .locator('xpath=following-sibling::ol[1]');
  await expect(families.locator('li').first().getByRole('link')).toHaveCount(2);
});

test('emigration and immigration can be filtered one direction at a time', async ({ page }) => {
  await page.goto('/wedin/statistics');

  // following:: not following-sibling:: — the heading shares a row with the
  // filter now, so the list is no longer its direct sibling.
  const list = page.locator('h3', { hasText: /Emigration and immigration/ })
    .locator('xpath=following::ul[1]');
  await expect(list.locator('li').first()).toBeVisible();
  // Moves, not people: someone who moved four times is one entry with four
  // lines under it, so the deepest list items are what the counts refer to.
  const moves = () => list.locator('li:not(:has(li))').count();
  const all = await moves();

  const picker = page.getByLabel(/^Show$/);
  // The counts are in the option labels, so the answer is there before picking.
  await expect(picker.locator('option').first()).toContainText(String(all));

  await picker.selectOption('IMMI');
  const immi = await moves();
  await expect(list.getByText(/Emigration|Utvandring/)).toHaveCount(0);

  await picker.selectOption('EMIG');
  const emig = await moves();
  await expect(list.getByText(/^Immigration|Invandring/)).toHaveCount(0);

  // the two directions together are the whole list, nothing lost or invented
  expect(immi + emig).toBe(all);
  expect(immi).toBeGreaterThan(0);
  expect(emig).toBeGreaterThan(0);
});
