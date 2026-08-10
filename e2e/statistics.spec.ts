import { test, expect } from '@playwright/test';

test('statistiksidan nås från menyn och visar alla fyra avsnitt', async ({ page }) => {
  await page.goto('/wedin');
  await page.getByRole('link', { name: 'Statistik' }).click();
  await expect(page).toHaveURL(/\/statistik/);
  for (const heading of ['Liv och livslängd', 'Namn', 'Familjer', 'Orter och arbete']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('varje diagram har sina siffror även som tabell', async ({ page }) => {
  await page.goto('/wedin/statistik');
  await expect(page.getByRole('heading', { name: 'Liv och livslängd' })).toBeVisible();
  // två diagram i liv, ett i familjer — alla med tabell under
  await expect.poll(() => page.getByRole('table').count()).toBe(3);
});

test('omöjliga åldrar presenteras inte som roliga fakta', async ({ page }) => {
  await page.goto('/wedin/statistik');
  await expect(page.getByText(/Åldrar över 110 år räknas som datafel/)).toBeVisible();
  const ages = await page.locator('ol li', { hasText: /\d+ år$/ }).allInnerTexts();
  for (const row of ages) {
    const age = Number(/(\d+) år$/.exec(row.trim())?.[1] ?? 0);
    expect(age).toBeLessThanOrEqual(110);
  }
});

test('avgränsning till en person hamnar i url:en och överlever omladdning', async ({ page }) => {
  await page.goto('/wedin/statistik');
  await expect(page.getByRole('heading', { name: 'Liv och livslängd' })).toBeVisible();
  // första kortet i första <dl> är antalet personer; "Personer" som text
  // finns även i menyn, så sikta på kortet i stället
  const peopleCard = page.locator('dl').first().locator('div').first();
  const everyone = await peopleCard.innerText();

  await page.getByLabel('Välj person').fill('Sven-Erik Wedin');
  await page.getByRole('button', { name: 'Sök' }).click();
  await page.getByRole('button', { name: /Sven-Erik Wedin/ }).first().click();

  await expect(page).toHaveURL(/person=I\d+/);
  await expect(page.getByText(/Statistik för Sven-Erik Wedin/)).toBeVisible();
  // siffrorna ska faktiskt ha smalnat av, inte bara rubriken
  await expect.poll(() => peopleCard.innerText()).not.toBe(everyone);

  await page.reload();
  await expect(page.getByText(/Statistik för Sven-Erik Wedin/)).toBeVisible();

  await page.getByRole('button', { name: 'Visa hela släktträdet' }).click();
  await expect(page).not.toHaveURL(/person=/);
  await expect.poll(() => peopleCard.innerText()).toBe(everyone);
});

/**
 * Every list on this page answers a question that provokes the next one — who
 * *was* the person who lived to 104? The name has to be the way there.
 */
test('namnen i statistiken leder till personsidan', async ({ page }) => {
  await page.goto('/wedin/statistik');

  const longest = page.locator('h3', { hasText: /Längst liv|Longest lives/ })
    .locator('xpath=following-sibling::ol[1]');
  const first = longest.getByRole('link').first();
  await expect(first).toBeVisible();
  const name = (await first.textContent())!.trim();

  await first.click();
  await expect(page).toHaveURL(/\/wedin\/person\/I\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

  // and the couples in Största familjer link each partner on their own
  await page.goto('/wedin/statistik');
  const families = page.locator('h3', { hasText: /Största familjerna|Largest families/ })
    .locator('xpath=following-sibling::ol[1]');
  await expect(families.locator('li').first().getByRole('link')).toHaveCount(2);
});
