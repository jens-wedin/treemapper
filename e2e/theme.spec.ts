import { test, expect } from '@playwright/test';

const htmlClass = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.className);

test.describe('mörkt läge', () => {
  test.use({ colorScheme: 'dark' });

  test('följer systemet som standard', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => htmlClass(page)).toContain('dark');
    await expect(page.getByLabel('Utseende')).toHaveValue('system');
  });

  test('ett uttryckligt ljust val vinner över systemet och minns', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Utseende').selectOption('light');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await page.reload();
    await expect(page.getByLabel('Utseende')).toHaveValue('light');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    // och tillbaka till systemet, som här är mörkt
    await page.getByLabel('Utseende').selectOption('system');
    await expect.poll(() => htmlClass(page)).toContain('dark');
  });
});

test.describe('ljust läge', () => {
  test.use({ colorScheme: 'light' });

  test('följer systemet och kan tvingas mörkt', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => htmlClass(page)).not.toContain('dark');

    await page.getByLabel('Utseende').selectOption('dark');
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
    await page.getByLabel('Utseende').selectOption('dark');
    await expect.poll(cardFill).not.toBe(lightCard);

    // en svensk flagga är blå och gul oavsett tema
    expect(await flagFill()).toBe('#006aa7');
  });
});
