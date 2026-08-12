import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Runs against `.e2e/`, never the real database — `global-setup.ts` copies it
 * and a test in health.spec.ts asserts which file is being served.
 *
 * **Each test makes the data it needs and takes it away again.** The first
 * version of this file asserted on `Bjertrå` and `Vattingen`, real places that
 * were in the queue at the time. They are not any more, because the page did
 * its job — four tests broke the moment the work they cover was finished. A
 * test for a queue must not depend on the queue being full.
 */

/**
 * A parish this tree has never heard of, so nothing else can answer for it —
 * and a fresh one per test, because a rejection is remembered by the place text
 * and would otherwise hide the place from the test that runs next.
 */
let run = 0;
let PARISH = '';
let KNOWN = '';
let BARE = '';
let NEAR = '';

let personId: string;
const eventIds: number[] = [];

async function addEvent(api: APIRequestContext, place: string) {
  const res = await api.post('/api/events', {
    data: {
      ownerType: 'person', ownerId: personId, type: 'RESI',
      dateRaw: null, place, description: null, age: null,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  eventIds.push((await res.json()).data.id);
}

test.beforeEach(async ({ request }) => {
  PARISH = `Kvarnhult${'ABCDEFGH'[run++]}`;
  KNOWN = `${PARISH}, Sverige`;
  BARE = `${PARISH} Nedre`;
  NEAR = `${PARISH}s kyrkogård`;

  const person = await request.post('/api/persons', {
    data: { givenName: 'Country', surname: 'Fixture', sex: 'U' },
  });
  expect(person.ok(), await person.text()).toBeTruthy();
  personId = (await person.json()).data.id;

  // Three places: one that teaches the country, one to be learned from it, and
  // one that only a near-spelling can reach.
  await addEvent(request, KNOWN);
  await addEvent(request, BARE);
  await addEvent(request, NEAR);
});

test.afterEach(async ({ request }) => {
  for (const id of eventIds.splice(0)) await request.delete(`/api/events/${id}`);
  if (personId) await request.delete(`/api/persons/${personId}`);
});

const learnedSection = (page: import('@playwright/test').Page) =>
  page.locator('#countries-learned').locator('..');
const quarantineSection = (page: import('@playwright/test').Page) =>
  page.locator('#countries-quarantine').locator('..');

test.describe('Countries', () => {
  test('groups the inferences by the evidence behind them', async ({ page }) => {
    await page.goto('/wedin/countries');

    const section = learnedSection(page);
    await expect(section.getByRole('heading', { name: 'Learned from this tree' })).toBeVisible();

    const group = section.getByRole('listitem')
      .filter({ hasText: `${PARISH} → Sweden` }).first();
    await expect(group).toBeVisible();
    await expect(group).toContainText('word match');
  });

  test('lists the places a group covers when the disclosure is opened', async ({ page }) => {
    await page.goto('/wedin/countries');

    const group = learnedSection(page).getByRole('listitem')
      .filter({ hasText: `${PARISH} → Sweden` }).first();
    await expect(group.locator('summary')).toContainText('Show places');

    await group.locator('summary').click();
    await expect(group.getByText(BARE, { exact: true })).toBeVisible();
  });

  test('offers no way to approve the near-spelling matches in bulk', async ({ page }) => {
    await page.goto('/wedin/countries');

    const section = quarantineSection(page);
    await expect(section.getByRole('heading', { name: 'Needs a closer look' })).toBeVisible();

    // The point of the section. Reading all of these against the real database
    // found seven wrong countries, and a bulk button is how they would get in.
    await expect(section.getByRole('button', { name: /approve all/i })).toHaveCount(0);
    await expect(section.getByRole('listitem').filter({ hasText: NEAR })).toContainText('≈');
  });

  test('writes the country into the place when an inference is approved', async ({ page }) => {
    await page.goto('/wedin/countries');

    const group = learnedSection(page).getByRole('listitem')
      .filter({ hasText: `${PARISH} → Sweden` }).first();
    await group.getByRole('button', { name: /^Approve Sweden for/ }).click();
    await expect(page.getByText(/events updated/)).toBeVisible();

    // Gone from the queue, because the place now names its country.
    await expect(
      learnedSection(page).getByRole('listitem').filter({ hasText: `${PARISH} → Sweden` }),
    ).toHaveCount(0);

    await page.goto(`/wedin/person/${personId}`);
    // exact, because the change history says it a second time — both correct.
    await expect(page.getByText(`${BARE}, Sverige`, { exact: true })).toBeVisible();
  });

  test('remembers a rejection so the inference does not come back', async ({ page }) => {
    await page.goto('/wedin/countries');

    const row = quarantineSection(page).getByRole('listitem').filter({ hasText: NEAR }).first();
    await row.getByRole('button', { name: /^Reject Sweden for/ }).click();
    await expect(page.getByText(/left as they were/)).toBeVisible();

    await page.reload();
    await expect(
      quarantineSection(page).getByRole('listitem').filter({ hasText: NEAR }),
    ).toHaveCount(0);
  });

  test('links a near-spelling match to the record where it is fixed by hand', async ({ page }) => {
    await page.goto('/wedin/countries');

    // Rejecting only stops the offer; the place stays as wrong as it was. The
    // link is the way to actually correct it.
    const row = quarantineSection(page).getByRole('listitem').filter({ hasText: NEAR }).first();
    await row.getByRole('link', { name: 'Country Fixture' }).click();

    await expect(page).toHaveURL(new RegExp(`/wedin/person/${personId}$`));
  });

  test('links each place inside a group to whoever carries it', async ({ page }) => {
    await page.goto('/wedin/countries');

    const group = learnedSection(page).getByRole('listitem')
      .filter({ hasText: `${PARISH} → Sweden` }).first();
    await group.locator('summary').click();

    await group.locator('details li').filter({ hasText: BARE })
      .getByRole('link', { name: 'Country Fixture' }).click();
    await expect(page).toHaveURL(new RegExp(`/wedin/person/${personId}$`));
  });

  test('is reachable from settings', async ({ page }) => {
    await page.goto('/wedin/settings');
    await page.getByRole('link', { name: 'Countries' }).click();
    await expect(page).toHaveURL(/\/wedin\/countries$/);
    await expect(page.getByRole('heading', { name: 'Countries', level: 1 })).toBeVisible();
  });
});
