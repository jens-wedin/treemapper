import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Mutating tests — these run against the .e2e.db copy (see e2e/global-setup.ts).
test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

test('the queue is grouped by severity, worst first', async ({ page }) => {
  await page.goto('/wedin/issues');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Consistency bench');
  await expect(page.getByText(/left of .* flagged/)).toBeVisible();

  const headings = page.getByRole('heading', { level: 2 });
  await expect(headings.first()).toContainText('Logical error');
  await expect(headings.nth(1)).toContainText('Duplicate');
  await expect(page.getByLabel('Category')).toBeVisible();
});

test('a person named in a consistency problem links to their page', async ({ page }) => {
  await page.goto('/wedin/issues');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Consistency bench');
  // the worst-first cards name a person; the name in the sentence is a link
  const nameLink = page.locator('li p a').first();
  await expect(nameLink).toBeVisible();
  await nameLink.click();
  await expect(page).toHaveURL(/\/wedin\/person\/I\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the filters replace the list rather than adding to it', async ({ page }) => {
  await page.goto('/wedin/issues');
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('Logical error');

  // Choosing a warning category must not leave the logical errors behind —
  // duplicate React keys used to leave old cards standing.
  //
  // Whichever category the queue offers today: the option's value is the issue
  // code and its label is that code translated, with a count appended. Filter by
  // the code, compare against the title. A hardcoded category would quietly stop
  // testing anything as the data gets cleaned up.
  const picker = page.getByLabel('Category');
  const option = picker.locator('option').nth(1);
  const chosen = (await option.getAttribute('value'))!;
  const title = ((await option.textContent()) ?? '').replace(/\s*\(\d[\d\s,.]*\)\s*$/, '').trim();
  await picker.selectOption(chosen);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);
  const categories = page.locator('ul > li > div > span.font-medium');
  await expect(categories.first()).toBeVisible();
  const distinct = new Set(await categories.allTextContents());
  expect([...distinct]).toEqual([title]);

  // and the severity filter reaches groups that otherwise sit beyond the first 500
  await picker.selectOption('');
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('Logical error');

  // A severity that still has findings: the labels carry counts, and emptied
  // categories are the normal end state of working through the queue.
  const grades = page.getByLabel('Severity');
  const labelled = await grades.locator('option').evaluateAll(os =>
    (os as HTMLOptionElement[]).map(o => ({ value: o.value, label: (o.textContent ?? '').trim() })));
  const withFindings = labelled.find(o => o.value && !/\(0\)$/.test(o.label))!;
  await grades.selectOption(withFindings.value);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 }))
    .toContainText(withFindings.label.replace(/\s*\(.*\)$/, ''));
});

test('dismissing hides the problem, and Show dismissed brings it back', async ({ page }) => {
  await page.goto('/wedin/issues?category=' + 'death-before-birth');
  const cards = page.locator('ul > li');
  await expect(cards.first()).toBeVisible();   // the list is fetched asynchronously
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);

  await cards.first().getByRole('button', { name: 'Dismiss' }).click();
  await expect(cards).toHaveCount(before - 1);

  // .click(), not .check() — the checkbox is driven by URL state through React
  const toggle = page.getByLabel('Show dismissed');
  await toggle.click();
  await expect(toggle).toBeChecked();
  const dismissedCard = cards.filter({ hasText: 'Dismissed' }).first();
  await expect(dismissedCard).toBeVisible();
  await dismissedCard.getByRole('button', { name: 'Restore' }).click();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(cards).toHaveCount(before);
});

test('Fix leads to the person page', async ({ page }) => {
  await page.goto('/wedin/issues?category=' + 'death-before-birth');
  await expect(page.locator('ul > li').first()).toBeVisible();
  await page.locator('ul > li').first().getByRole('link', { name: 'Fix' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('merging duplicates removes one of the records', async ({ page }) => {
  await page.goto('/wedin/issues?category=' + 'possible-duplicate');
  const card = page.locator('ul > li').first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Merge' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Merging deletes the other record', { exact: false })).toBeVisible();
  // wait for the person details, and read which two records are being compared
  await expect(dialog.locator('table')).toBeVisible();
  const ids = await dialog.locator('th').allTextContents();
  const duplicateId = ids.join(' ').match(/I\d+/g)?.[1];
  expect(duplicateId).toBeTruthy();

  await dialog.getByRole('button', { name: 'Merge the records' }).click();
  await expect(dialog).toBeHidden();

  // the removed record no longer exists
  await page.goto(`/wedin/person/${duplicateId}`);
  await expect(page.getByText('That person does not exist')).toBeVisible();
});

test('Home shows the consistency scoreboard', async ({ page }) => {
  await page.goto('/wedin');
  await expect(page.getByRole('heading', { name: 'Consistency problems' })).toBeVisible();
  await page.getByRole('link', { name: 'Consistency bench' }).click();
  await expect(page).toHaveURL(/\/issues/);
});

test('the person page ends with that person\'s problems', async ({ page }) => {
  // I500244 has four children born after his own death, plus more problems
  await page.goto('/wedin/person/I500244');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Inconsistencies' }) });
  await expect(section).toBeVisible();

  // at the very bottom: after the citations, just before the change history
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.slice(-3)).toEqual(['Citations', 'Inconsistencies', 'Change history']);

  // the same grouping as the tree's panel: one heading per category, with a count
  const group = section.getByRole('listitem').filter({ hasText: 'Child born after a parent died' });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('(4)');
  await expect(group).toContainText('after their father Abraham Abrahamsson died in 1800');

  // and no heading at all for somebody with nothing flagged
  await page.goto('/wedin/person/I500001');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inconsistencies' })).toHaveCount(0);
});

test('the history shows what was fixed and what was set aside', async ({ page }) => {
  await page.goto('/wedin/issues');
  const log = page.locator('details');
  await expect(log).toContainText('Fixed and dismissed');
  // collapsed until asked for — the queue is what the page is about
  await expect(log.locator('ol > li').first()).toBeHidden();
  await log.locator('summary').click();
  await expect(log).toHaveAttribute('open', '');

  // wedin.db carries earlier corrections along in audit_log
  const first = log.locator('ol > li').first();
  await expect(first).toBeVisible();
  await expect(first).toContainText('Fixed');

  // and a dismissal lands on top, with its category and its note
  await page.goto('/wedin/issues');
  const option = page.getByLabel('Category').locator('option').nth(1);
  const code = (await option.getAttribute('value'))!;
  const title = ((await option.textContent()) ?? '').replace(/\s*\(\d[\d\s,.]*\)\s*$/, '').trim();
  await page.goto('/wedin/issues?category=' + encodeURIComponent(code));
  await expect(page.locator('ul > li').first()).toBeVisible();
  await page.locator('ul > li').first().getByRole('button', { name: 'Dismiss' }).click();

  await log.locator('summary').click();
  await expect(log.locator('ol > li').first()).toContainText('Dismissed');
  // the log names the problem in the reader's language, not by its code
  await expect(log.locator('ol > li').first()).toContainText(title);
});
