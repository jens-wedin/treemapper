import { test, expect } from '@playwright/test';

/**
 * Runs against `.e2e/`, never the real database — `global-setup.ts` copies it
 * and a test in health.spec.ts asserts which file is being served.
 *
 * These specs approve and reject real inferences, so each one puts back what it
 * changed. Two date specs in this repo passed alone and failed in the full run
 * for leaving an extra event behind.
 */
test.describe('Countries', () => {
  test('groups the inferences by the evidence behind them', async ({ page }) => {
    await page.goto('/wedin/countries');

    const learned = page.locator('#countries-learned').locator('..');
    await expect(learned.getByRole('heading', { name: 'Learned from this tree' })).toBeVisible();

    // The strongest group in this tree. Named rather than nth(), so the test
    // fails loudly if the ranking changes rather than checking a different row.
    const bjuraker = learned.getByRole('listitem').filter({ hasText: 'Bjuråker → Sweden' }).first();
    await expect(bjuraker).toBeVisible();
    await expect(bjuraker).toContainText('exact match');
  });

  test('lists the places a group covers when the disclosure is opened', async ({ page }) => {
    await page.goto('/wedin/countries');

    const group = page.locator('#countries-learned').locator('..')
      .getByRole('listitem').filter({ hasText: 'Bjuråker → Sweden' }).first();
    const summary = group.locator('summary');
    await expect(summary).toContainText('Show places');

    await summary.click();
    await expect(group.getByText('Bjuråker, Gävleborgs län', { exact: true })).toBeVisible();
  });

  test('offers no way to approve the near-spelling matches in bulk', async ({ page }) => {
    await page.goto('/wedin/countries');

    const quarantine = page.locator('#countries-quarantine').locator('..');
    await expect(quarantine.getByRole('heading', { name: 'Needs a closer look' })).toBeVisible();

    // The point of the section. Reading all of these against the real database
    // found seven wrong countries, and a bulk button is how they would get in.
    await expect(quarantine.getByRole('button', { name: /approve all/i })).toHaveCount(0);

    // Each row shows what it matched, so a wrong one is visible.
    await expect(quarantine.getByRole('listitem').first()).toContainText('≈');
  });

  test('writes the country into the place when a single inference is approved', async ({ page }) => {
    await page.goto('/wedin/countries');

    const quarantine = page.locator('#countries-quarantine').locator('..');
    const row = quarantine.getByRole('listitem').filter({ hasText: 'Bjertrå' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /^Approve Sweden for/ }).click();
    await expect(page.getByText(/events updated/)).toBeVisible();

    // Gone from the queue, because the place now names its country.
    await expect(
      quarantine.getByRole('listitem').filter({ hasText: /^Sweden\s*Bjertrå/ }),
    ).toHaveCount(0);
  });

  test('remembers a rejection so the inference does not come back', async ({ page }) => {
    await page.goto('/wedin/countries');

    const quarantine = page.locator('#countries-quarantine').locator('..');
    const row = quarantine.getByRole('listitem').filter({ hasText: 'Vattingen' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /^Reject Sweden for/ }).click();
    await expect(page.getByText(/left as they were/)).toBeVisible();

    await page.reload();
    await expect(
      page.locator('#countries-quarantine').locator('..')
        .getByRole('listitem').filter({ hasText: 'Vattingen' }),
    ).toHaveCount(0);
  });

  test('is reachable from settings', async ({ page }) => {
    await page.goto('/wedin/settings');
    await page.getByRole('link', { name: 'Countries' }).click();
    await expect(page).toHaveURL(/\/wedin\/countries$/);
    await expect(page.getByRole('heading', { name: 'Countries', level: 1 })).toBeVisible();
  });
});
