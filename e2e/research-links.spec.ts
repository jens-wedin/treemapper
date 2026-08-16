import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Runs against the real imported database (copied to .e2e/); skip when absent.
test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

/** The "Research elsewhere" section on a person page. */
function research(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Research elsewhere' }) });
}

test('a person page offers pre-filled searches on the external archives', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sven-Erik Wedin');

  const section = research(page);
  await expect(section.getByRole('heading', { name: 'Research elsewhere' })).toBeVisible();

  const links = section.getByRole('link');
  await expect(links).toHaveText([/Riksarkivet/, /FamilySearch/, /Geneanet/, /Google/]);

  const href = async (name: RegExp) => (await section.getByRole('link', { name }).getAttribute('href'))!;

  // Every link opens in a new tab, and none leaks a referrer to the archive.
  for (const l of await links.all()) {
    await expect(l).toHaveAttribute('target', '_blank');
    await expect(l).toHaveAttribute('rel', /noreferrer/);
  }

  // FamilySearch: the given name and the maiden surname go in as separate fields.
  const fs = new URL(await href(/FamilySearch/));
  expect(fs.hostname).toBe('www.familysearch.org');
  expect(fs.searchParams.get('q.givenName')).toBe('Sven-Erik');
  expect(fs.searchParams.get('q.surname')).toBe('Wedin');

  // Riksarkivet: a free-text search on the name.
  const ra = new URL(await href(/Riksarkivet/));
  expect(ra.hostname).toBe('sok.riksarkivet.se');
  expect(ra.searchParams.get('Sokord')).toContain('Sven-Erik Wedin');

  // Geneanet: the given name and the maiden surname go in as separate fields.
  const gn = new URL(await href(/Geneanet/));
  expect(gn.hostname).toBe('en.geneanet.org');
  expect(gn.searchParams.get('prenom')).toBe('Sven-Erik');
  expect(gn.searchParams.get('nom')).toBe('Wedin');

  // Google: a plain web search carrying the name.
  const g = new URL(await href(/Google/));
  expect(g.hostname).toBe('www.google.com');
  expect(g.searchParams.get('q')).toContain('Sven-Erik Wedin');
});
