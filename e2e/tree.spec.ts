import fs from 'node:fs';
import { test, expect } from '@playwright/test';

/** Generations and the card toggles now live behind the settings icon. */
const openSettings = async (page: import('@playwright/test').Page) => {
  const panel = page.getByRole('dialog');
  if (await panel.isVisible()) return;                 // clicking again would close it
  await page.getByRole('button', { name: 'Visningsinställningar' }).click();
  await panel.waitFor();
};

test.skip(!fs.existsSync('wedin.db'), 'wedin.db saknas — kör npm run import först');

test('trädet renderas och piltangenter flyttar fokus', async ({ page }) => {
  await page.goto('/trad/I500001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Träd');
  const focusNode = page.locator('[data-tree-node="I500001"]');
  await expect(focusNode).toBeVisible();
  await focusNode.focus();
  await expect(focusNode).toBeFocused();   // vänta in renderingen innan tangenttryck
  await page.keyboard.press('ArrowUp');    // I500001 har 2 föräldrar
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('klick på ett kort öppnar personpanelen', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.locator('[data-tree-node="I500001"]').click();
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
  await expect(panel.getByRole('heading', { name: 'Familj' })).toBeVisible();
  // panelen stängs med Escape
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('panelen kan fokusera om trädet och öppna personsidan', async ({ page }) => {
  await page.goto('/trad/I500001');
  // Enter på ett kort öppnar panelen
  const start = page.locator('[data-tree-node="I500001"]');
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Fokusera trädet här' }).click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)I\d+/);
  await expect(panel).toBeHidden();

  await page.locator('[data-tree-node]').first().click();
  await page.getByRole('complementary', { name: 'Personuppgifter' })
    .getByRole('link', { name: 'Gå till personsida' }).click();
  await expect(page).toHaveURL(/\/person\/I\d+/);
});

// Uppåt och nedåt körs var för sig: den första utfällningen panorerar vyn, och
// då hamnar knappen i andra änden av trädet utanför den synliga ytan.
for (const direction of ['up', 'down'] as const) {
  test(`familjevyn fäller ut generationer på plats (${direction})`, async ({ page }) => {
    await page.goto('/trad/I502603?upp=2&ned=2&vy=family');
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

    // knappen vänder, och fäller ihop grenen igen
    const fold = page.locator(`[data-handle="${personId}"][data-handle-direction="${direction}"]`);
    await expect(fold).toHaveAttribute('data-handle-action', 'collapse');
    await fold.click();
    await expect
      .poll(() => page.locator('[data-tree-node]').count())
      .toBe(before);
  });
}

test('familjevyns utfällningsknapp nås med tangentbordet', async ({ page }) => {
  await page.goto('/trad/I502603?upp=2&ned=2&vy=family');
  const up = page.locator('[data-handle][data-handle-direction="up"]').first();
  await expect(up).toBeVisible();
  const personId = await up.getAttribute('data-handle');

  // uppåtpilen från det översta kortet ska stanna vid knappen
  await page.locator(`[data-tree-node="${personId}"]`).first().focus();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-handle')))
    .toBe(personId);

  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-handle="${personId}"][data-handle-direction="up"]`))
    .toHaveAttribute('data-handle-action', 'collapse');
});

test('antavlan visar förfäder men inga ättlingar', async ({ page }) => {
  await page.goto('/trad/I500003?upp=3&ned=2');
  await page.getByRole('tab', { name: 'Antavla' }).click();
  await expect(page).toHaveURL(/vy=pedigree/);
  await expect(page.getByRole('group', { name: 'Antavla' })).toBeVisible();

  // fokuspersonen och hans far finns med
  await expect(page.locator('[data-tree-node="I500003"]')).toBeVisible();
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();

  // inga ättlingar — hämta barnen ur API:et i stället för att gissa id:n
  const tree = await (await page.request.get('/api/tree/I500003?up=0&down=1')).json();
  const childIds: string[] = tree.descendants.children.map((c: { person: { id: string } }) => c.person.id);
  expect(childIds.length).toBeGreaterThan(0);
  for (const id of childIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toHaveCount(0);
  }
  // förklaringen till varför "generationer nedåt" saknas bor i inställningarna
  await openSettings(page);
  await expect(page.getByText('Antavla och solfjäder visar bara förfäder.')).toBeVisible();
  await expect(page.getByLabel('Generationer nedåt')).toHaveCount(0);
});

test('generationsvalet håller i sig och gäller genast', async ({ page }) => {
  await page.goto('/trad/I500003?upp=2&vy=pedigree');
  await expect(page.locator('[data-tree-node]').first()).toBeVisible();
  const atTwo = await page.locator('[data-tree-node]').count();

  await openSettings(page);
  const generations = page.getByLabel('Generationer uppåt');
  await generations.selectOption('5');
  await expect(generations).toHaveValue('5');        // får inte studsa tillbaka
  await expect(page).toHaveURL(/upp=5/);
  await expect
    .poll(() => page.locator('[data-tree-node]').count())
    .toBeGreaterThan(atTwo);

  // och valet överlever en omladdning
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel('Generationer uppåt')).toHaveValue('5');
});

test('utfällningsknappen öppnar två generationer till på plats', async ({ page }) => {
  // två generationer: förfäder bortom farföräldrarna ligger utanför tavlan
  await page.goto('/trad/I500003?upp=2&vy=pedigree');
  await expect(page.locator('[data-tree-node]').first()).toBeVisible();
  const before = await page.locator('[data-tree-node]').count();

  const handle = page.locator('[data-handle]').first();
  await expect(handle).toBeVisible();
  const ancestorId = await handle.getAttribute('data-handle');
  const url = page.url();

  await handle.click();

  // förfäderns egna föräldrar ritas ut — resten av tavlan står kvar
  const forebears = await (await page.request.get(`/api/tree/${ancestorId}?up=1&down=0`)).json();
  const parentIds: string[] = forebears.ancestors.parents.map((p: { person: { id: string } }) => p.person.id);
  expect(parentIds.length).toBeGreaterThan(0);
  for (const id of parentIds) {
    await expect(page.locator(`[data-tree-node="${id}"]`)).toBeVisible();
  }
  await expect(page.locator(`[data-tree-node="I500003"]`)).toBeVisible();
  expect(await page.locator('[data-tree-node]').count()).toBeGreaterThan(before);
  expect(page.url()).toBe(url);                 // ingen omnavigering, ingen blink

  // knappen blir en hopfällningsknapp, och fäller ihop grenen igen
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

test('utfällningsknappen nås med tangentbordet', async ({ page }) => {
  await page.goto('/trad/I500003?upp=2&vy=pedigree');
  const handle = page.locator('[data-handle]').first();
  await expect(handle).toBeVisible();
  const ancestorId = await handle.getAttribute('data-handle');

  // fokusera förfaderns kort och gå höger — där finns ingen förälder utritad,
  // så högerpilen ska landa på knappen
  await page.locator(`[data-tree-node="${ancestorId}"]`).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-handle')))
    .toBe(ancestorId);

  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-handle="${ancestorId}"]`)).toHaveAttribute('data-handle-action', 'collapse');
});

test('solfjädern renderas och kan navigeras med tangentbord', async ({ page }) => {
  await page.goto('/trad/I500003?upp=4&vy=fan');
  await expect(page.getByRole('group', { name: 'Solfjäder' })).toBeVisible();
  const slices = page.locator('[data-tree-node]');
  await expect(slices.first()).toBeVisible();
  expect(await slices.count()).toBeGreaterThan(5);

  // piltangent flyttar fokus mellan skivor — fråga DOM:en var fokus hamnade
  // i stället för att läsa tabindex, som släpar en rendering efter
  const first = page.locator('[data-tree-node="I500001"]');
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-tree-node')))
    .not.toBe('I500001');
});

test('personpanelen fungerar i både antavla och solfjäder', async ({ page }) => {
  for (const [view, label] of [['pedigree', 'Antavla'], ['fan', 'Solfjäder']] as const) {
    await page.goto(`/trad/I500003?upp=3&vy=${view}`);
    await expect(page.getByRole('group', { name: label })).toBeVisible();
    // klicka på etiketten: en skivas bounding box har sin mittpunkt inne i
    // solfjäderns navcirkel, så ett klick "mitt på" elementet träffar navet
    await page.locator('[data-tree-node="I500001"] text').first().click();
    const panel = page.getByRole('complementary', { name: 'Personuppgifter' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik Wedin');
    await page.keyboard.press('Escape');
  }
});

test('listvyn är en likvärdig väg och kan fokusera om trädet', async ({ page }) => {
  await page.goto('/trad/I500001');
  await page.getByRole('tab', { name: 'Lista' }).click();
  await expect(page.getByRole('heading', { name: 'Förfäder' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ättlingar' })).toBeVisible();
  // :has(> h2 …) — only the inner list section, not the page-level <section> that also contains the heading
  const ancestorSection = page.locator('section:has(> h2:text-is("Förfäder"))');
  await ancestorSection.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/trad\/(?!I500001)/);
});

test('personsidan länkar till trädet', async ({ page }) => {
  await page.goto('/person/I500001');
  await page.getByRole('link', { name: 'Visa i träd' }).click();
  await expect(page).toHaveURL(/\/trad\/I500001/);
  await expect(page.locator('[data-tree-node="I500001"]')).toBeVisible();
});

test.describe('konsekvensmärken', () => {
  // I500244 har åtta problem, varav ett fel — en tacksam startpunkt
  const url = '/trad/I500244?upp=1&ned=1&vy=family';
  const card = (page: import('@playwright/test').Page) => page.locator('[data-tree-node="I500244"]');

  test('är avstängda tills man ber om dem, och minns valet', async ({ page }) => {
    await page.goto(url);
    await expect(card(page)).toBeVisible();
    await expect(page.locator('[data-issue-severity]')).toHaveCount(0);

    await openSettings(page);
    const toggle = page.getByLabel('Visa konsekvenser');
    await toggle.check();
    await expect(card(page).locator('[data-issue-severity="error"]')).toBeVisible();
    await expect(card(page).locator('[data-issue-count="8"]')).toBeVisible();

    // valet följer med till nästa besök och till de andra vyerna
    await page.reload();
    await openSettings(page);
    await expect(toggle).toBeChecked();
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    await page.goto('/trad/I500244?upp=2&vy=pedigree');
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    await page.goto('/trad/I500244?upp=2&vy=fan');
    await expect(page.locator('[data-issue-severity]').first()).toBeVisible();
  });

  test('märket säger vad som är fel, och släcks när man stänger av', async ({ page }) => {
    await page.goto(url);
    await openSettings(page);
    await page.getByLabel('Visa konsekvenser').check();
    await expect(card(page).locator('[data-issue-severity]')).toBeVisible();

    // skärmläsare får samma besked som pricken ger ögat
    await expect(card(page)).toHaveAttribute('aria-label', /8 konsekvenser: .+/);

    await openSettings(page);

    await page.getByLabel('Visa konsekvenser').uncheck();
    await expect(page.locator('[data-issue-severity]')).toHaveCount(0);
  });

  test('panelen berättar vad som är fel, med köns egna ord', async ({ page }) => {
    await page.goto(url);
    const panel = page.getByRole('complementary', { name: 'Personuppgifter' });

    // avstängd: panelen är sig lik
    await card(page).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Konsekvenser' })).toHaveCount(0);

    await openSettings(page);

    await page.getByLabel('Visa konsekvenser').check();
    await expect(panel.getByRole('heading', { name: 'Konsekvenser' })).toBeVisible();
    // samma kategori en gång, med antalet, och problemets egen formulering
    const group = panel.getByRole('listitem').filter({ hasText: 'Barn fött efter förälders bortgång' });
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('(4)');
    await expect(group).toContainText('efter faderns Abraham Abrahamsson död 1800');

    // en person utan problem får inget avsnitt
    await page.goto('/trad/I500001?upp=1&ned=1&vy=family');
    await page.locator('[data-tree-node="I500001"]').click();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('Sven-Erik');
    await expect(panel.getByRole('heading', { name: 'Konsekvenser' })).toHaveCount(0);
  });

  test('det som avfärdats i Konsekvensbänken räknas inte i trädet', async ({ page }) => {
    await page.goto(url);
    await openSettings(page);
    await page.getByLabel('Visa konsekvenser').check();
    await expect(card(page).locator('[data-issue-count="8"]')).toBeVisible();

    // avfärda ett av de åtta, som i kön
    const queue = await (await page.request.get('/api/issues?limit=500')).json();
    const mine = queue.items.find((i: { personIds: string[] }) => i.personIds.includes('I500244'));
    await page.request.post('/api/issues/dismiss', { data: { fingerprint: mine.fingerprint } });

    await page.reload();
    await expect(card(page).locator('[data-issue-count="7"]')).toBeVisible();
  });
});

test.describe('övergångar mellan vyerna', () => {
  test('antavlan lindar ihop sig till solfjädern', async ({ page }) => {
    await page.goto('/trad/I500003?upp=4&vy=pedigree');
    await expect(page.getByRole('group', { name: 'Antavla' })).toBeVisible();

    await page.getByRole('tab', { name: 'Solfjäder' }).click();
    // markörerna tar över mitten av övergången …
    await expect(page.locator('[data-morph]')).toBeVisible();
    // … och lämnar över till solfjädern
    await expect(page.locator('[data-morph]')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Solfjäder' })).toBeVisible();
  });

  test('mindre rörelse hoppar över både morf och korsfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/trad/I500003?upp=4&vy=pedigree');
    await expect(page.getByRole('group', { name: 'Antavla' })).toBeVisible();

    await page.getByRole('tab', { name: 'Solfjäder' }).click();
    await expect(page.getByRole('group', { name: 'Solfjäder' })).toBeVisible();
    await expect(page.locator('[data-morph]')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Antavla' })).toHaveCount(0);
  });

  test('bara ett träd åt gången är nåbart under en övergång', async ({ page }) => {
    await page.goto('/trad/I500003?upp=3&vy=family');
    await expect(page.getByRole('group', { name: 'Släktträd' })).toBeVisible();

    // Vyn som lämnar ligger kvar en stund med aria-hidden och inert; varken
    // skärmläsare eller test ska se två träd.
    await page.getByRole('tab', { name: 'Antavla' }).click();
    for (let i = 0; i < 5; i++) {
      expect(await page.getByRole('group', { name: /Släktträd|Antavla|Solfjäder/ }).count()).toBeLessThanOrEqual(1);
      await page.waitForTimeout(40);
    }
    await expect(page.getByRole('group', { name: 'Antavla' })).toBeVisible();
  });
});

test.describe('personpanelen glider in', () => {
  const openPanel = async (page: import('@playwright/test').Page) => {
    await page.goto('/trad/I500001?upp=2&ned=1&vy=family');
    await page.locator('[data-tree-node="I500001"]').click();
    return page.getByRole('complementary', { name: 'Personuppgifter' });
  };

  test('panelen animeras in och ligger kvar medan den glider ut', async ({ page }) => {
    const panel = await openPanel(page);
    // klassen sitter kvar så länge panelen är öppen — inget tidsberoende
    await expect(panel).toHaveClass(/panel-entering/);

    await panel.getByRole('button', { name: 'Stäng panelen' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('mindre rörelse stänger panelen på en gång', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const panel = await openPanel(page);
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'Stäng panelen' }).click();
    // utan väntan på en utglidning som inte spelas
    await expect(panel).toHaveCount(0, { timeout: 150 });
  });
});

test.describe('zoomen', () => {
  const percent = (page: import('@playwright/test').Page) =>
    page.locator('text=/^\\d+%$/').first().innerText().then(s => Number(s.replace('%', '')));

  const wheel = (page: import('@playwright/test').Page, deltaY: number) =>
    page.locator('svg[role="group"]').first().dispatchEvent('wheel', { deltaY, deltaMode: 0, bubbles: true });

  test('hjulet zoomar i proportion till hur långt man rullar', async ({ page }) => {
    await page.goto('/trad/I500001?upp=2&ned=1&vy=family');
    await page.locator('[data-tree-node]').first().waitFor();

    // en liten knuff — som en styrplatta ger — ska knappt märkas
    const start = await percent(page);
    await wheel(page, -6);
    const afterNudge = await percent(page);
    expect(afterNudge - start).toBeLessThanOrEqual(2);

    // en hel hjulklick tar större kliv, men aldrig mer än ett tak
    await wheel(page, -120);
    const afterNotch = await percent(page);
    expect(afterNotch - afterNudge).toBeGreaterThan(afterNudge - start);
    expect(afterNotch).toBeLessThanOrEqual(Math.round(afterNudge * 1.1) + 1);
  });
});

test.describe('att kasta trädet', () => {
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

  test('kastet rullar vidare efter att man släppt, och saktar in', async ({ page }) => {
    await page.goto('/trad/I500001?upp=2&ned=1&vy=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await flick(page);
    const atRelease = await panX(page);
    await page.waitForTimeout(150);
    const first = await panX(page);
    await page.waitForTimeout(150);
    const second = await panX(page);

    // Lika långa fönster, annars säger jämförelsen ingenting: ett längre
    // fönster hinner längre även medan farten avtar.
    expect(first - atRelease).toBeGreaterThan(0);                  // rullar vidare av sig självt
    expect(second - first).toBeGreaterThan(0);                     // fortsätter
    expect(second - first).toBeLessThan(first - atRelease);        // men saktar in

    // och stannar av sig självt
    await page.waitForTimeout(1500);
    const stopped = await panX(page);
    await page.waitForTimeout(250);
    expect(await panX(page)).toBeCloseTo(stopped, 1);
  });

  test('mindre rörelse stannar där fingret släppte', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/trad/I500001?upp=2&ned=1&vy=family');
    await page.locator('[data-tree-node]').first().waitFor();

    await flick(page);
    const atRelease = await panX(page);
    await page.waitForTimeout(300);
    expect(await panX(page)).toBe(atRelease);
  });
});
