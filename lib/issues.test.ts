import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events } from '../db/schema';
import { detectIssues, summarizeByPerson, type Issue } from './issues';

let db: Db;
let eventId = 0;

beforeEach(() => {
  db = createDb(':memory:');
  eventId = 0;
});

function person(id: string, opts: { given?: string; surname?: string; sex?: 'M' | 'F' | 'U' } = {}) {
  db.insert(persons).values({
    id,
    givenName: opts.given ?? id,
    surname: opts.surname ?? 'Test',
    sex: opts.sex ?? 'U',
  }).run();
  return id;
}

function event(ownerId: string, type: string, dateRaw: string | null, extra: { place?: string; ownerType?: 'person' | 'family' } = {}) {
  db.insert(events).values({
    id: ++eventId,
    ownerType: extra.ownerType ?? 'person',
    ownerId,
    type,
    dateRaw,
    dateYear: dateRaw ? Number(/(\d{4})/.exec(dateRaw)?.[1] ?? 0) || null : null,
    place: extra.place ?? null,
  }).run();
}

/** Person with birth/death years as plain YYYY dates. */
function human(id: string, birth: number | null, death: number | null, opts: Parameters<typeof person>[1] = {}) {
  person(id, opts);
  if (birth != null) event(id, 'BIRT', String(birth));
  if (death != null) event(id, 'DEAT', String(death));
  return id;
}

function family(id: string, husbandId: string | null, wifeId: string | null, children: string[] = []) {
  db.insert(families).values({ id, husbandId, wifeId }).run();
  children.forEach((c, seq) => db.insert(familyChildren).values({ familyId: id, childId: c, seq }).run());
  return id;
}

const run = (referenceYear = 2026): Issue[] => detectIssues(db, { referenceYear });
const cats = (issues: Issue[]) => issues.map(i => i.category);
const of = (issues: Issue[], category: string) => issues.filter(i => i.category === category);

describe('detectIssues — logiska fel', () => {
  it('Födsel efter bortgång', () => {
    human('I1', 1801, 1800);
    const hits = of(run(), 'Födsel efter bortgång');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ severity: 'error', personIds: ['I1'] });
    expect(hits[0].text).toContain('1801');
  });

  it('Barnet äldre än föräldrarna', () => {
    human('P', 1790, null, { sex: 'M' });
    human('C', 1780, null);
    family('F1', 'P', null, ['C']);
    const hits = of(run(), 'Barnet äldre än föräldrarna');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds).toEqual(['C', 'P']);
  });

  it('Barn fött efter förälders bortgång — far får ett års nåd, mor inte', () => {
    human('FAR', 1750, 1800, { sex: 'M' });
    human('MOR', 1760, 1800, { sex: 'F' });
    human('SENT', 1836, null);      // långt efter båda
    human('STRAX', 1801, null);     // året efter faderns död → ok för far, fel för mor
    family('F1', 'FAR', 'MOR', ['SENT', 'STRAX']);
    const hits = of(run(), 'Barn fött efter förälders bortgång');
    // SENT: far + mor = 2 · STRAX: bara mor = 1
    expect(hits).toHaveLength(3);
    expect(hits.filter(h => h.personIds[0] === 'STRAX')).toHaveLength(1);
    expect(hits.filter(h => h.personIds[0] === 'STRAX')[0].personIds[1]).toBe('MOR');
  });

  it('Faktum som inträffar efter döden — men begravning är tillåten', () => {
    human('I1', 1800, 1850);
    event('I1', 'RESI', '1860');
    event('I1', 'BURI', '1850');
    const hits = of(run(), 'Faktum som inträffar efter döden');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toContain('Bosatt');
  });

  it('Faktum som inträffar före födelse', () => {
    human('I1', 1900, null);
    event('I1', 'RESI', '1890');
    expect(of(run(), 'Faktum som inträffar före födelse')).toHaveLength(1);
  });

  it('intervalldatum som omsluter födelsen eller döden är inget fel', () => {
    human('I1', 1926, 1990);
    event('I1', 'RESI', 'BET 1916 AND 1928');  // spannet omsluter födelsen → ok
    human('I2', 1900, 1950);
    event('I2', 'RESI', 'BET 1940 AND 1960');  // spannet omsluter döden → ok
    human('I3', 1926, null);
    event('I3', 'RESI', 'BET 1900 AND 1910');  // hela spannet före födelsen → fel
    const issues = run();
    expect(of(issues, 'Faktum som inträffar före födelse').map(i => i.personIds[0])).toEqual(['I3']);
    expect(of(issues, 'Faktum som inträffar efter döden')).toHaveLength(0);
  });
});

describe('detectIssues — åldersvarningar', () => {
  it('Vid liv men för gammal kräver att DEAT saknas helt', () => {
    human('LEVANDE', 1900, null);          // 126 år, ingen dödshändelse → flaggas
    person('DÖD_UTAN_DATUM');
    event('DÖD_UTAN_DATUM', 'BIRT', '1900');
    event('DÖD_UTAN_DATUM', 'DEAT', null); // markerad avliden → flaggas INTE
    const hits = of(run(2026), 'Vid liv men för gammal');
    expect(hits.map(h => h.personIds[0])).toEqual(['LEVANDE']);
    expect(hits[0].text).toContain('126');
  });

  it('Vid liv men för gammal följer referenceYear', () => {
    human('I1', 1950, null);
    expect(of(run(2026), 'Vid liv men för gammal')).toHaveLength(0);
    expect(of(run(2200), 'Vid liv men för gammal')).toHaveLength(1);
  });

  it('Dog för gammal', () => {
    human('I1', 1594, 1712);
    expect(of(run(), 'Dog för gammal')).toHaveLength(1);
  });

  it('Föräldrar för unga och Förälder för gammal', () => {
    human('UNG', 1780, null, { sex: 'F' });
    human('GAMMAL', 1700, null, { sex: 'M' });
    human('BARN', 1790, null);
    family('F1', 'GAMMAL', 'UNG', ['BARN']);
    const issues = run();
    expect(of(issues, 'Föräldrar för unga när de fick barn')).toHaveLength(1); // 10 år
    expect(of(issues, 'Förälder för gammal när man fått barn')).toHaveLength(1); // 90 år
  });

  it('Syskon med nära ålder (kräver fulla datum, tvillingar undantagna)', () => {
    person('A'); event('A', 'BIRT', '30 DEC 1934');
    person('B'); event('B', 'BIRT', '1 JUN 1935');   // 153 dagar → flaggas
    person('D'); event('D', 'BIRT', '1940');          // grovt datum → hoppas över
    family('F1', null, null, ['A', 'B', 'D']);
    // tvillingar i egen familj: 0 dagar isär → flaggas inte
    person('T1'); event('T1', 'BIRT', '4 MAY 1900');
    person('T2'); event('T2', 'BIRT', '4 MAY 1900');
    family('F2', null, null, ['T1', 'T2']);
    const hits = of(run(), 'Syskon med nära ålder');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds.sort()).toEqual(['A', 'B']);
  });

  it('Stor åldersskillnad mellan makar, Gift för ung, Dog för ung för att vara gift', () => {
    human('MAN', 1675, 1676, { sex: 'M' });
    human('KVINNA', 1614, null, { sex: 'F' });
    const f = family('F1', 'MAN', 'KVINNA');
    event(f, 'MARR', '1675', { ownerType: 'family' });
    const issues = run();
    expect(of(issues, 'Stor åldersskillnad mellan makar')).toHaveLength(1); // 61 år
    expect(of(issues, 'Gift för ung')).toHaveLength(1);                     // mannen 0 år
    expect(of(issues, 'Dog för ung för att vara gift')).toHaveLength(1);    // dog vid 1
  });

  it('Fler födelsefakta och fler dödsfakta', () => {
    person('I1');
    event('I1', 'BIRT', '1800');
    event('I1', 'BIRT', '1801');
    event('I1', 'DEAT', '1860');
    event('I1', 'DEAT', '1861');
    const issues = run();
    expect(of(issues, 'Fler födelsefakta för samma person')).toHaveLength(1);
    expect(of(issues, 'Fler än ett dödsfakta för samma person')).toHaveLength(1);
  });
});

describe('detectIssues — luckor', () => {
  it('Saknar födelse, Födelse utan datum, Dödsfall utan datum', () => {
    person('INGEN');                               // saknar födelse
    person('UTAN_DATUM'); event('UTAN_DATUM', 'BIRT', null);
    person('DÖD'); event('DÖD', 'BIRT', '1800'); event('DÖD', 'DEAT', null);
    const issues = run();
    expect(of(issues, 'Saknar födelse').map(i => i.personIds[0])).toEqual(['INGEN']);
    expect(of(issues, 'Födelse utan datum').map(i => i.personIds[0])).toEqual(['UTAN_DATUM']);
    expect(of(issues, 'Dödsfall utan datum').map(i => i.personIds[0])).toEqual(['DÖD']);
  });
});

describe('detectIssues — familj och namn', () => {
  it('Flera äktenskap för samma par', () => {
    human('M', 1800, null, { sex: 'M' });
    human('K', 1802, null, { sex: 'F' });
    const f = family('F1', 'M', 'K');
    event(f, 'MARR', '1820', { ownerType: 'family' });
    event(f, 'MARR', '1821', { ownerType: 'family' });
    expect(of(run(), 'Flera äktenskap för samma par')).toHaveLength(1);
  });

  it('Namn som gift inlagt som födelseefternamn', () => {
    person('M', { surname: 'Le Blanc', sex: 'M' });
    person('K', { surname: 'Le Blanc', sex: 'F' });
    family('F1', 'M', 'K');
    const hits = of(run(), 'Namn som gift inlagt som födelseefternamn');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds[0]).toBe('K');
  });

  it('Syskon med samma förnamn kräver identiskt förnamn', () => {
    human('A', 1700, null, { given: 'Margareta' });
    human('B', 1705, null, { given: 'Margareta' });
    human('C', 1710, null, { given: 'Margareta Elisabet' }); // annat förnamn → ingen träff
    family('F1', null, null, ['A', 'B', 'C']);
    const hits = of(run(), 'Syskon med samma förnamn');
    expect(hits).toHaveLength(2); // ett per syskon i paret A/B
    expect(hits.map(h => h.personIds[0]).sort()).toEqual(['A', 'B']);
  });

  it('återanvänt namn efter ett syskons död flaggas inte', () => {
    human('DÖD', 1700, 1704, { given: 'Margareta' });
    human('UPPKALLAD', 1705, null, { given: 'Margareta' }); // född efter systerns död
    family('F1', null, null, ['DÖD', 'UPPKALLAD']);
    expect(of(run(), 'Syskon med samma förnamn')).toHaveLength(0);
  });

  it('Dubbla mellanslag och versalfel', () => {
    person('A', { given: 'Maria  Jakobsdotter' });
    person('B', { given: 'LIzbet' });
    person('C', { given: 'EddieEdward' });
    person('D', { given: 'Anna', surname: 'ANDERSSON' }); // rena versaler är ok
    const issues = run();
    expect(of(issues, 'Dubbla mellanslag i namnet').map(i => i.personIds[0])).toEqual(['A']);
    expect(of(issues, 'Inkorrekt användande av stora/små bokstäver').map(i => i.personIds[0]).sort()).toEqual(['B', 'C']);
  });

  it('Möjlig inkonsekvent stavning av efternamn och platsnamn', () => {
    // 'Bergqvist' x3 vs 'Bergqvist,' x1  → efternamnsvariant
    for (const id of ['A', 'B', 'C']) person(id, { surname: 'Bergqvist' });
    person('D', { surname: 'Bergqvist,' });
    for (const id of ['E', 'F', 'G']) { person(id); event(id, 'BURI', '1900', { place: 'Bjuråkers kyrka' }); }
    person('H'); event('H', 'BURI', '1901', { place: 'Bjuråkers kyka' });
    const issues = run();
    expect(of(issues, 'Möjlig inkonsekvent stavning av efternamn').map(i => i.personIds[0])).toEqual(['D']);
    expect(of(issues, 'Möjlig inkonsekvent stavning av platsnamn').map(i => i.personIds[0])).toEqual(['H']);
  });

  it('Årtal med två siffror och Platsnamn liknar datum', () => {
    person('A'); event('A', 'BIRT', '16');
    person('B'); event('B', 'MARR', '1785', { place: '18 Mar 1785' });
    const issues = run();
    expect(of(issues, 'Årtal med två siffror')).toHaveLength(1);
    expect(of(issues, 'Platsnamn liknar datum')).toHaveLength(1);
  });
});

describe('detectIssues — dubbletter', () => {
  it('grupperar på namn + födelseår och graderar säkerhet', () => {
    human('P1', 1750, null, { sex: 'M' });
    human('P2', 1752, null, { sex: 'F' });
    human('A1', 1779, null, { given: 'Anders', surname: 'Johansson' });
    human('A2', 1779, null, { given: 'anders', surname: ' Johansson' }); // normaliseras lika
    family('F1', 'P1', 'P2', ['A1', 'A2']);                             // samma föräldrar → high
    human('B1', 1800, null, { given: 'Karin', surname: 'Eriksdotter' });
    human('B2', 1800, null, { given: 'Karin', surname: 'Eriksdotter' }); // inga föräldrar → review
    const hits = of(run(), 'Möjlig dubblett');
    expect(hits).toHaveLength(4); // ett per medlem
    const high = hits.filter(h => h.duplicateGroup?.confidence === 'high');
    expect(high.map(h => h.personIds[0]).sort()).toEqual(['A1', 'A2']);
    expect(high[0].duplicateGroup!.ids.sort()).toEqual(['A1', 'A2']);
    const review = hits.filter(h => h.duplicateGroup?.confidence === 'review');
    expect(review.map(h => h.personIds[0]).sort()).toEqual(['B1', 'B2']);
  });

  it('grupperar inte personer utan födelseår', () => {
    human('X1', null, null, { given: 'Okänd', surname: 'Person' });
    human('X2', null, null, { given: 'Okänd', surname: 'Person' });
    expect(of(run(), 'Möjlig dubblett')).toHaveLength(0);
  });
});

describe('detectIssues — fingeravtryck och undantag', () => {
  it('är stabila mellan körningar men ändras när värdena ändras', () => {
    human('I1', 1801, 1800);
    const first = of(run(), 'Födsel efter bortgång')[0].fingerprint;
    expect(of(run(), 'Födsel efter bortgång')[0].fingerprint).toBe(first);

    // samma person och kategori, andra årtal → nytt fingeravtryck (problemet
    // återuppstår med rätta även om det tidigare avfärdats)
    db = createDb(':memory:');
    eventId = 0;
    human('I1', 1805, 1802);
    expect(of(run(), 'Födsel efter bortgång')[0].fingerprint).not.toBe(first);
  });

  it('hoppar över MyHeritage-platshållaren I88888888', () => {
    person('I88888888', { given: 'Unassociated photos', surname: '' });
    expect(run()).toEqual([]);
  });

  it('ger inga problem för en ren person', () => {
    human('I1', 1900, 1980, { given: 'Ren', surname: 'Person' });
    expect(cats(run())).toEqual([]);
  });
});

describe('summarizeByPerson', () => {
  it('räknar problem per person och behåller den värsta allvarlighetsgraden', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', category: 'Saknar födelse', severity: 'warning', text: '', personIds: ['I1'] },
      { fingerprint: 'b', category: 'Födsel efter bortgång', severity: 'error', text: '', personIds: ['I1'] },
      { fingerprint: 'c', category: 'Syskon med samma förnamn', severity: 'info', text: '', personIds: ['I2'] },
    ];
    expect(summarizeByPerson(issues)).toEqual({
      I1: { count: 2, severity: 'error', categories: ['Födsel efter bortgång', 'Saknar födelse'] },
      I2: { count: 1, severity: 'info', categories: ['Syskon med samma förnamn'] },
    });
  });

  it('märker alla inblandade, inte bara den som äger kön', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', category: 'Barnet äldre än föräldrarna', severity: 'error', text: '', personIds: ['C', 'P'] },
    ];
    const marks = summarizeByPerson(issues);
    expect(Object.keys(marks).sort()).toEqual(['C', 'P']);
    expect(marks.P).toEqual({ count: 1, severity: 'error', categories: ['Barnet äldre än föräldrarna'] });
  });

  it('räknar samma kategori två gånger men listar den en gång', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', category: 'Dödsfall utan datum', severity: 'warning', text: '', personIds: ['I1'] },
      { fingerprint: 'b', category: 'Dödsfall utan datum', severity: 'warning', text: '', personIds: ['I1'] },
    ];
    expect(summarizeByPerson(issues).I1).toEqual({
      count: 2, severity: 'warning', categories: ['Dödsfall utan datum'],
    });
  });

  it('ger ett tomt register när inget är fel', () => {
    expect(summarizeByPerson([])).toEqual({});
  });
});
