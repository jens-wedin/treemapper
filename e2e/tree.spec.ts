import fs from 'node:fs';
import { test, expect } from '@playwright/test';

/** Generations and the card toggles now live behind the settings icon. */
const openSettings = async (page: import('@playwright/test').Page) => {
  const panel = page.getByRole('dialog');
  if (await panel.isVisible()) return;                 // clicking again would close it
  await page.getByRole('button', { name: 'Display settings' }).click();
  await panel.waitFor();
};

test.skip(!fs.existsSync('trees/wedin.db'), 'trees/wedin.db is missing — run npm run import first');

test('the tree renders, and arrow keys move the focus', async ({ page }) => {
  await page.goto('/wedin/tree/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tree');
  const focusNode = page.locator('[data-tree-node="I500001"]');
  await expect(focusNode).toBeVisible();
  await focusNode.focus();
  await expect(focusNode).toBeFocused();   // wait for the render before pressing a key
  await page.keyboard.press('ArrowUp');    // I500001 has 2 parents
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('clicking a card opens the person panel', async ({ page }) => {
  await page.goto('/wedin/tree/I500001');
  await page.locator('[data-tree-node="I500001"]').click();
  const panel = page.getByRole('complementary', { name: 'Person details' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
  await expect(panel.getByRole('heading', { name: 'Family' })).toBeVisible();
  // the panel closes with Escape
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('the panel can re-centre the tree and open the person page', async ({ page }) => {
  await page.goto('/wedin/tree/I500001');
  // Enter on a card opens the panel
  const start = page.locator('[data-tree-node="I500001"]');
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Person details' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Centre the tree here' }).click();
  await expect(page).toHaveURL(/\/tree\/(?!I500001)I\d+/);
  await expect(panel).toBeHidden();

  await page.locator('[data-tree-node]').first().click();
  await page.getByRole('complementary', { name: 'Person details' })
    .getByRole('link', { name: 'Open person page' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

// Up and down run separately: the first expansion pans the view, and
// the button then ends up at the far end of the tree, outside the visible area.
for (const direction of ['up', 'down'] as const) {
  test(`the family view expands generations in place (${direction})`, async ({ page }) => {
    await page.goto('/wedin/tree/I502603?up=2&down=2&view=family');
    await expect(page.locator('[data-tree-node]').first()).toBeVisible();
    const before = await page.locator('[data-tree-node]').count();
    const url = page.url();

    const handle = page
      .locator(`[data-handle][data-handle-direction="${direction}"][data-handle-action="expand"]`)
      .first();
    await expect(handle).toBeVisible();
    const personId = await handle.getAttribute('data-handle');

    await handle.click();
    await expect
      .poll(() => page.locator('[data-tree-node]').count())
      .toBeGreaterThan(before);
    expect(page.url()).toBe(url);                  // ingen omnavigering, ingen blink

    // the button turns around, and collapses the branch again
    const fold = page.locator(`[data-handle="${personId}"][data-handle-direction="${direction}"]`);
    await expect(fold).toHaveAttribute('data-handle-action', 'collapse');
    await fold.click();
    await expect
      .poll(() => page.locator('[data-tree-node]').count())
      .toBe(before);
  });
}

test('the family view\'s expand button is reachable by keyboard', async ({ page }) => {
  await page.goto('/wedin/tree/I502603?up=2&down=2&view=family');
  const up = page.locator('[data-handle][data-handle-direction="up"]').first();
  await expect(up).toBeVisible();
  const personId = await up.getAttribute('data-handle');

  // the up arrow from the topmost card should stop at the button
  await page.locator(`[data-tree-node="${personId}"]`).first().focus();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-handle')))
    .toBe(personId);

  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-handle="${personId}"][data-handle-direction="up"]`))
    .toHaveAttribute('data-handle-action', 'collapse');
});

test('the pedigree chart shows ancestors but no descendants', async ({ page }) => {
  await page.goto('/wedin/tree/I500003?up=3&down=2');
  await page.getByRole('tab', { name: 'Pedigree' }).click();
  await expect(page).toHaveURL(/view=pedigree/);
  await expect(page.getByRole('group', { name: 'Pedigree' })).toBeVisible();

  // fokuspersonen och hans far finns med
  await expect(page.locator('[data-tree-node="I500003"]')).toBeVisible();
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();

  // no descendants — take the children from the API rather than guessing ids
  const tree = await (await page.request.get('/api/tree/I500003?up=0&down=1')).json();
  const childIds: string[] = tree.descendants.children.map((c: { person: { id: string } }) => c.person.id);
  expect(childIds.length).toBeGreaterThan(0);
  for (const id of childIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toHaveCount(0);
  }
  // the explanation for the missing "generations down" lives in the settings
  await openSettings(page);
  await expect(page.getByText('The pedigree and fan views show ancestors only.')).toBeVisible();
  await expect(page.getByLabel('Generations down')).toHaveCount(0);
});

test('the generation choice sticks, and applies at once', async ({ page }) => {
  await page.goto('/wedin/tree/I500003?up=2&view=pedigree');
  await expect(page.locator('[data-tree-node]').first()).toBeVisible();
  const atTwo = await page.locator('[data-tree-node]').count();

  await openSettings(page);
  const generations = page.getByLabel('Generations up');
  await generations.selectOption('5');
  await expect(generations).toHaveValue('5');        // must not bounce back
  await expect(page).toHaveURL(/up=5/);
  await expect
    .poll(() => page.locator('[data-tree-node]').count())
    .toBeGreaterThan(atTwo);

  // and the choice survives a reload
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel('Generations up')).toHaveValue('5');
});

test('the expand button opens two more generations in place', async ({ page }) => {
  // two generations: ancestors beyond the grandparents lie outside the chart
  await page.goto('/wedin/tree/I500003?up=2&view=pedigree');
  await expect(page.locator('[data-tree-node]').first()).toBeVisible();
  const before = await page.locator('[data-tree-node]').count();

  const handle = page.locator('[data-handle]').first();
  await expect(handle).toBeVisible();
  const ancestorId = await handle.getAttribute('data-handle');
  const url = page.url();

  await handle.click();

  // the ancestor's own parents are drawn — the rest of the chart stays put
  const forebears = await (await page.request.get(`/api/tree/${ancestorId}?up=1&down=0`)).json();
  const parentIds: string[] = forebears.ancestors.parents.map((p: { person: { id: string } }) => p.person.id);
  expect(parentIds.length).toBeGreaterThan(0);
  for (const id of parentIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toBeVisible();
  }
  await expect(page.locator(`[data-tree-node="I500003"]`)).toBeVisible();
  expect(await page.locator('[data-tree-node]').count()).toBeGreaterThan(before);
  expect(page.url()).toBe(url);                 // ingen omnavigering, ingen blink

  // the button becomes a collapse button, and folds the branch back up
  const collapse = page.locator(`[data-handle="${ancestorId}"]`);
  await expect(collapse).toHaveAttribute('data-handle-action', 'collapse');
  await collapse.click();
  for (const id of parentIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toHaveCount(0);
  }
  await expect
    .poll(() => page.locator('[data-tree-node]').count())
    .toBe(before);
});

test('the expand button is reachable by keyboard', async ({ page }) => {
  await page.goto('/wedin/tree/I500003?up=2&view=pedigree');
  const handle = page.locator('[data-handle]').first();
  await expect(handle).toBeVisible();
  const ancestorId = await handle.getAttribute('data-handle');

  // focus the ancestor's card and go right — no parent is drawn there,
  // so the right arrow should land on the button
  await page.locator(`[data-tree-node="${ancestorId}"]`).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-handle')))
    .toBe(ancestorId);

  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-handle="${ancestorId}"]`)).toHaveAttribute('data-handle-action', 'collapse');
});

test('the fan chart renders, and can be navigated by keyboard', async ({ page }) => {
  await page.goto('/wedin/tree/I500003?up=4&view=fan');
  await expect(page.getByRole('group', { name: 'Fan chart' })).toBeVisible();
  const slices = page.locator('[data-tree-node]');
  await expect(slices.first()).toBeVisible();
  expect(await slices.count()).toBeGreaterThan(5);

  // an arrow key moves focus between slices — ask the DOM where focus landed
  // rather than reading tabindex, which lags a render behind
  const first = page.locator('[data-tree-node="I500001"]');
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('the person panel works in both the pedigree and the fan chart', async ({ page }) => {
  for (const [view, label] of [['pedigree', 'Pedigree'], ['fan', 'Fan chart']] as const) {
    await page.goto(`/wedin/tree/I500003?up=3&view=${view}`);
    await expect(page.getByRole('group', { name: label })).toBeVisible();
    // click the label: a slice's bounding box has its centre inside
    // the fan's hub circle, so a click "in the middle" hits the hub
    await page.locator('[data-tree-node="I500001"] text').first().click();
    const panel = page.getByRole('complementary', { name: 'Person details' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
    await page.keyboard.press('Escape');
  }
});

test('the list view is an equal path, and can re-centre the tree', async ({ page }) => {
  await page.goto('/wedin/tree/I500001');
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.getByRole('heading', { name: 'Ancestors' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Descendants' })).toBeVisible();
  // :has(> h2 …) — only the inner list section, not the page-level <section> that also contains the heading
  const ancestorSection = page.locator('section:has(> h2:text-is("Ancestors"))');
  await ancestorSection.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/tree\/(?!I500001)/);
});

test('the person page links to the tree', async ({ page }) => {
  await page.goto('/wedin/person/I500001');
  await page.getByRole('link', { name: 'Show in tree' }).click();
  await expect(page).toHaveURL(/\/tree\/I500001/);
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();
});

test.describe('problem marks', () => {
  // I500244 has eight problems, one of them an error — a convenient starting point
  const url = '/tree/I500244?up=1&down=1&view=family';
  const card = (page: import('@playwright/test').Page) => page.locator('[data-tree-node="I500244"]');

  test('are off until asked for, and the choice is remembered', async ({ page }) => {
    await page.goto(url);
    await expect(card(page)).toBeVisible();
    await expect(page.locator('[data-issue-severity]')).toHaveCount(0);

    await openSettings(page);
    const toggle = page.getByLabel('Show inconsistencies');
    await toggle.check();
    await expect(card(page).locator('[data-issue-severity="error"]')).toBeVisible();
    await expect(card(page).locator('[data-issue-count="8"]')).toBeVisible();

    // the choice carries to the next visit and to the other views
    await page.reload();
    await openSettings(page);
    await expect(toggle).toBeChecked();
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    await page.goto('/wedin/tree/I500244?up=2&view=pedigree');
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    await page.goto('/wedin/tree/I500244?up=2&view=fan');
    await expect(page.locator('[data-issue-severity]').first()).toBeVisible();
  });

  test('the mark says what is wrong, and goes out when switched off', async ({ page }) => {
    await page.goto(url);
    await openSettings(page);
    await page.getByLabel('Show inconsistencies').check();
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    // a screen reader gets the same message the dot gives the eye
    await expect(card(page)).toHaveAttribute('aria-label', /8 inconsistencies: .+/);

    await openSettings(page);

    await page.getByLabel('Show inconsistencies').uncheck();
    await expect(page.locator('[data-issue-severity]')).toHaveCount(0);
  });

  test('the panel says what is wrong, in the queue\'s own words', async ({ page }) => {
    await page.goto(url);
    const panel = page.getByRole('complementary', { name: 'Person details' });

    // switched off: the panel looks as it always did
    await card(page).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Inconsistencies' })).toHaveCount(0);

    await openSettings(page);

    await page.getByLabel('Show inconsistencies').check();
    await expect(panel.getByRole('heading', { name: 'Inconsistencies' })).toBeVisible();
    // the same category once, with the count, and the problem's own wording
    const group = panel.getByRole('listitem').filter({ hasText: 'Child born after a parent died' });
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('(4)');
    await expect(group).toContainText('after their father Abraham Abrahamsson died in 1800');

    // a person with no problems gets no section
    await page.goto('/wedin/tree/I500001?up=1&down=1&view=family');
    await page.locator('[data-tree-node="I500001"]').click();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik');
    await expect(panel.getByRole('heading', { name: 'Inconsistencies' })).toHaveCount(0);
  });

  test('what was dismissed in Konsekvensbänken is not counted in the tree', async ({ page }) => {
    await page.goto(url);
    await openSettings(page);
    await page.getByLabel('Show inconsistencies').check();
    await expect(card(page).locator('[data-issue-count="8"]')).toBeVisible();

    // dismiss one of the eight, as the queue would
    const queue = await (await page.request.get('/api/issues?limit=500')).json();
    const mine = queue.items.find((i: { personIds: string[] }) => i.personIds.includes('I500244'));
    await page.request.post('/api/issues/dismiss', { data: { fingerprint: mine.fingerprint } });

    await page.reload();
    await expect(card(page).locator('[data-issue-count="7"]')).toBeVisible();
  });
});

test.describe('transitions between the views', () => {
  test('the pedigree chart winds itself into the fan chart', async ({ page }) => {
    await page.goto('/wedin/tree/I500003?up=4&view=pedigree');
    await expect(page.getByRole('group', { name: 'Pedigree' })).toBeVisible();

    await page.getByRole('tab', { name: 'Fan' }).click();
    // the markers take over the middle of the transition …
    await expect(page.locator('[data-morph]')).toBeVisible();
    // … and hand over to the fan chart
    await expect(page.locator('[data-morph]')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Fan chart' })).toBeVisible();
  });

  test('reduced motion skips both the morph and the cross-fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/wedin/tree/I500003?up=4&view=pedigree');
    await expect(page.getByRole('group', { name: 'Pedigree' })).toBeVisible();

    await page.getByRole('tab', { name: 'Fan' }).click();
    await expect(page.getByRole('group', { name: 'Fan chart' })).toBeVisible();
    await expect(page.locator('[data-morph]')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Pedigree' })).toHaveCount(0);
  });

  test('only one tree is reachable at a time during a transition', async ({ page }) => {
    await page.goto('/wedin/tree/I500003?up=3&view=family');
    await expect(page.getByRole('group', { name: 'Family tree' })).toBeVisible();

    // The leaving view lingers with aria-hidden and inert; neither a
    // screen reader nor a test should see two trees.
    await page.getByRole('tab', { name: 'Pedigree' }).click();
    for (let i = 0; i < 5; i++) {
      expect(await page.getByRole('group', { name: /Family tree chart|Pedigree|Fan chart/ }).count()).toBeLessThanOrEqual(1);
      await page.waitForTimeout(40);
    }
    await expect(page.getByRole('group', { name: 'Pedigree' })).toBeVisible();
  });
});

test.describe('the person panel slides in', () => {
  const openPanel = async (page: import('@playwright/test').Page) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node="I500001"]').click();
    return page.getByRole('complementary', { name: 'Person details' });
  };

  test('the panel animates in, and stays put while it slides back out', async ({ page }) => {
    const panel = await openPanel(page);
    // the class stays as long as the panel is open — nothing time-dependent
    await expect(panel).toHaveClass(/panel-entering/);

    await panel.getByRole('button', { name: 'Close panel' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('reduced motion closes the panel at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const panel = await openPanel(page);
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'Close panel' }).click();
    // with no wait for a slide-out that never plays
    await expect(panel).toHaveCount(0, { timeout: 150 });
  });
});

test.describe('the zoom', () => {
  const percent = (page: import('@playwright/test').Page) =>
    page.locator('text=/^\\d+%$/').first().innerText().then(s => Number(s.replace('%', '')));

  const wheel = (page: import('@playwright/test').Page, deltaY: number) =>
    page.locator('svg[role="group"]').first().dispatchEvent('wheel', { deltaY, deltaMode: 0, bubbles: true });

  /**
   * The zoom glides towards its target, so a reading taken straight after a
   * wheel event catches it in transit. The comparisons below are of the resting states.
   */
  const settled = async (page: import('@playwright/test').Page) => {
    let previous = -1;
    let current = await percent(page);
    while (current !== previous) {
      previous = current;
      await page.waitForTimeout(90);
      current = await percent(page);
    }
    return current;
  };

  test('the wheel zooms in proportion to how far it is scrolled', async ({ page }) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node]').first().waitFor();

    // a small nudge — what a trackpad gives — should barely register
    const start = await settled(page);
    await wheel(page, -6);
    const afterNudge = await settled(page);
    expect(afterNudge - start).toBeLessThanOrEqual(2);

    // a full wheel click takes a bigger step, but never more than a ceiling
    await wheel(page, -120);
    const afterNotch = await settled(page);
    expect(afterNotch - afterNudge).toBeGreaterThan(afterNudge - start);
    expect(afterNotch).toBeLessThanOrEqual(Math.round(afterNudge * 1.1) + 1);
  });
});

test.describe('flinging the tree', () => {
  const panX = async (page: import('@playwright/test').Page) => {
    const t = await page.locator('svg[role="group"] > g').first().getAttribute('transform');
    return Number(/translate\(([-\d.]+)/.exec(t ?? '')?.[1] ?? NaN);
  };

  /** Drag with real pointer events so the browser records a velocity. */
  const flick = async (page: import('@playwright/test').Page) => {
    const svg = page.locator('svg[role="group"]').first();
    const box = (await svg.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 200, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + 200 + i * 40, y);
    await page.mouse.up();
  };

  test('the fling coasts on after release, and slows down', async ({ page }) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await flick(page);
    const atRelease = await panX(page);
    await page.waitForTimeout(150);
    const first = await panX(page);
    await page.waitForTimeout(150);
    const second = await panX(page);

    // Equal windows, or the comparison says nothing: a longer one
    // covers more ground even while the speed is falling.
    expect(first - atRelease).toBeGreaterThan(0);                  // coasts on by itself
    expect(second - first).toBeGreaterThan(0);                     // keeps going
    expect(second - first).toBeLessThan(first - atRelease);        // men saktar in

    // and stops by itself
    await page.waitForTimeout(1500);
    const stopped = await panX(page);
    await page.waitForTimeout(250);
    expect(await panX(page)).toBeCloseTo(stopped, 1);
  });

  test('reduced motion stops where the finger let go', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await flick(page);
    const atRelease = await panX(page);
    await page.waitForTimeout(300);
    expect(await panX(page)).toBe(atRelease);
  });
});

test.describe('flinging the zoom', () => {
  const zoom = (page: import('@playwright/test').Page) =>
    page.locator('text=/^\\d+%$/').first().innerText().then(s => Number(s.replace('%', '')));

  const spin = async (page: import('@playwright/test').Page) => {
    const svg = page.locator('svg[role="group"]').first();
    for (let i = 0; i < 5; i++) {
      await svg.dispatchEvent('wheel', { deltaY: -60, deltaMode: 0, bubbles: true });
      await page.waitForTimeout(16);
    }
  };

  test('the zoom coasts on for a moment after the wheel stops', async ({ page }) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await spin(page);
    const atStop = await zoom(page);
    await page.waitForTimeout(400);
    const coasted = await zoom(page);
    await page.waitForTimeout(500);
    const settled = await zoom(page);

    expect(coasted).toBeGreaterThan(atStop);      // carries on by itself
    expect(settled).toBe(coasted);                // och stannar
  });

  test('reduced motion zooms without a tail', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await spin(page);
    const atStop = await zoom(page);
    await page.waitForTimeout(400);
    expect(await zoom(page)).toBe(atStop);
  });
});

test.describe('adding a relative from the card', () => {
  test('the plus appears only when the setting is on, and adds a parent', async ({ page }) => {
    await page.goto('/wedin/tree/I500001?up=2&down=1&view=family');
    const card = page.locator('[data-tree-node="I500001"]');
    await expect(card).toBeVisible();

    // off by default — no pluses on the cards
    await expect(page.getByRole('button', { name: /Add a relative to/ })).toHaveCount(0);

    await openSettings(page);
    await page.getByLabel('Add relatives').check();
    await page.keyboard.press('Escape');

    const plus = card.getByRole('button', { name: /Add a relative to Sven-Erik Wedin/ });
    await expect(plus).toBeVisible();
    await plus.click();

    // dialogen erbjuder samma tre val som personsidan
    const dialog = page.getByRole('dialog').filter({ hasText: 'Add a relative to Sven-Erik Wedin' });
    await expect(dialog.getByRole('button', { name: 'Add child' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add partner' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add parent' })).toBeVisible();

    // the choice leads to the same form the person page uses — in the same
    // dialog, because a dialog inside a dialog cannot be opened
    await dialog.getByRole('button', { name: 'Add child' }).click();
    await dialog.getByRole('radio', { name: 'Create a new person' }).check();
    await dialog.getByLabel('First name').fill('Testbarn');
    await dialog.getByLabel('Surname').fill('Wedin');
    await dialog.getByRole('button', { name: 'Save' }).click();

    // the dialog closes and the tree is redrawn with the new person
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: /Testbarn Wedin/ }).first()).toBeVisible();
  });
});
