import { test, expect } from '@playwright/test';

const htmlClass = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.className);

/** The appearance control is an icon menu now, not a select. */
const pickTheme = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
};
const themeButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /Appearance/ });

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system by default', async ({ page }) => {
    await page.goto('/wedin');
    await expect.poll(() => htmlClass(page)).toContain('dark');
    await expect(themeButton(page)).toHaveAccessibleName('Appearance: Follow system');
  });

  test('an explicit light choice beats the system, and is remembered', async ({ page }) => {
    await page.goto('/wedin');
    await pickTheme(page, 'Light');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await page.reload();
    await expect(themeButton(page)).toHaveAccessibleName('Appearance: Light');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    // and back to the system, which here is dark
    await pickTheme(page, 'Follow system');
    await expect.poll(() => htmlClass(page)).toContain('dark');
  });
});

test.describe('light mode', () => {
  test.use({ colorScheme: 'light' });

  test('follows the system, and can be forced dark', async ({ page }) => {
    await page.goto('/wedin');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await pickTheme(page, 'Dark');
    await expect.poll(() => htmlClass(page)).toContain('dark');
    await page.reload();
    await expect.poll(() => htmlClass(page)).toContain('dark');
  });

  test('the tree\'s cards change colour with the theme; the flags do not', async ({ page }) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await expect(page.locator('[data-tree-node]').first()).toBeVisible();

    const cardFill = () => page.locator('[data-tree-node] rect').first()
      .evaluate(el => getComputedStyle(el).fill);
    // flaggorna ritas som <rect fill="…"> inuti kortet
    const flagFill = () => page.locator('[data-tree-node] rect[fill="#006aa7"]')
      .first().evaluate(el => el.getAttribute('fill'));

    const lightCard = await cardFill();
    await pickTheme(page, 'Dark');
    await expect.poll(cardFill).not.toBe(lightCard);

    // a Swedish flag is blue and yellow whatever the theme
    expect(await flagFill()).toBe('#006aa7');
  });
});
