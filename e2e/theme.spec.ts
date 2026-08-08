import { test, expect } from '@playwright/test';

const htmlClass = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.className);

/** The appearance control is an icon menu now, not a select. */
const pickTheme = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByRole('button', { name: /Utseende/ }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
};
const themeButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /Utseende/ });

test.describe('mörkt läge', () => {
  test.use({ colorScheme: 'dark' });

  test('följer systemet som standard', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => htmlClass(page)).toContain('dark');
    await expect(themeButton(page)).toHaveAccessibleName('Utseende: Följ systemet');
  });

  test('ett uttryckligt ljust val vinner över systemet och minns', async ({ page }) => {
    await page.goto('/');
    await pickTheme(page, 'Ljust');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await page.reload();
    await expect(themeButton(page)).toHaveAccessibleName('Utseende: Ljust');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    // och tillbaka till systemet, som här är mörkt
    await pickTheme(page, 'Följ systemet');
    await expect.poll(() => htmlClass(page)).toContain('dark');
  });
});

test.describe('ljust läge', () => {
  test.use({ colorScheme: 'light' });

  test('följer systemet och kan tvingas mörkt', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await pickTheme(page, 'Mörkt');
    await expect.poll(() => htmlClass(page)).toContain('dark');
    await page.reload();
    await expect.poll(() => htmlClass(page)).toContain('dark');
  });

  test('trädets kort byter färg med temat, flaggorna gör det inte', async ({ page }) => {
    await page.goto('/trad/I500001?upp=2&ned=1&vy=family');
    await expect(page.locator('[data-tree-node]').first()).toBeVisible();

    const cardFill = () => page.locator('[data-tree-node] rect').first()
      .evaluate(el => getComputedStyle(el).fill);
    // flaggorna ritas som <rect fill="…"> inuti kortet
    const flagFill = () => page.locator('[data-tree-node] rect[fill="#006aa7"]')
      .first().evaluate(el => el.getAttribute('fill'));

    const lightCard = await cardFill();
    await pickTheme(page, 'Mörkt');
    await expect.poll(cardFill).not.toBe(lightCard);

    // en svensk flagga är blå och gul oavsett tema
    expect(await flagFill()).toBe('#006aa7');
  });
});
