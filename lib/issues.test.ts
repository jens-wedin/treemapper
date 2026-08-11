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
const cats = (issues: Issue[]) => issues.map(i => i.code);
const of = (issues: Issue[], code: string) => issues.filter(i => i.code === code);

describe('detectIssues — logical errors', () => {
  it('death-before-birth', () => {
    human('I1', 1801, 1800);
    const hits = of(run(), 'death-before-birth');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ severity: 'error', personIds: ['I1'] });
    expect(hits[0]!.params).toMatchObject({ birth: 1801, death: 1800 });
  });

  it('child-older-than-parents', () => {
    human('P', 1790, null, { sex: 'M' });
    human('C', 1780, null);
    family('F1', 'P', null, ['C']);
    const hits = of(run(), 'child-older-than-parents');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds).toEqual(['C', 'P']);
  });

  it('child born after a parent died — the father gets a year\'s grace, the mother none', () => {
    human('FAR', 1750, 1800, { sex: 'M' });
    human('MOR', 1760, 1800, { sex: 'F' });
    human('SENT', 1836, null);      // långt efter båda
    human('STRAX', 1801, null);     // året efter faderns död → ok för far, fel för mor
    family('F1', 'FAR', 'MOR', ['SENT', 'STRAX']);
    const hits = of(run(), 'child-born-after-parent-died');
    // SENT: far + mor = 2 · STRAX: bara mor = 1
    expect(hits).toHaveLength(3);
    expect(hits.filter(h => h.personIds[0] === 'STRAX')).toHaveLength(1);
    expect(hits.filter(h => h.personIds[0] === 'STRAX')[0].personIds[1]).toBe('MOR');
  });

  it('a fact after death — but a burial is allowed', () => {
    human('I1', 1800, 1850);
    event('I1', 'RESI', '1860');
    event('I1', 'BURI', '1850');
    const hits = of(run(), 'fact-after-death');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.params).toMatchObject({ event: 'RESI' });
  });

  it('fact-before-birth', () => {
    human('I1', 1900, null);
    event('I1', 'RESI', '1890');
    expect(of(run(), 'fact-before-birth')).toHaveLength(1);
  });

  it('a date range enclosing the birth or death is not an error', () => {
    human('I1', 1926, 1990);
    event('I1', 'RESI', 'BET 1916 AND 1928');  // spannet omsluter födelsen → ok
    human('I2', 1900, 1950);
    event('I2', 'RESI', 'BET 1940 AND 1960');  // spannet omsluter döden → ok
    human('I3', 1926, null);
    event('I3', 'RESI', 'BET 1900 AND 1910');  // hela spannet före födelsen → fel
    const issues = run();
    expect(of(issues, 'fact-before-birth').map(i => i.personIds[0])).toEqual(['I3']);
    expect(of(issues, 'fact-after-death')).toHaveLength(0);
  });
});

describe('detectIssues — age warnings', () => {
  it('alive but too old requires DEAT to be absent entirely', () => {
    human('LEVANDE', 1900, null);          // 126 år, ingen dödshändelse → flaggas
    person('DÖD_UTAN_DATUM');
    event('DÖD_UTAN_DATUM', 'BIRT', '1900');
    event('DÖD_UTAN_DATUM', 'DEAT', null); // markerad avliden → flaggas INTE
    const hits = of(run(2026), 'alive-too-old');
    expect(hits.map(h => h.personIds[0])).toEqual(['LEVANDE']);
    expect(hits[0]!.params).toMatchObject({ age: 126 });
  });

  it('alive but too old follows referenceYear', () => {
    human('I1', 1950, null);
    expect(of(run(2026), 'alive-too-old')).toHaveLength(0);
    expect(of(run(2200), 'alive-too-old')).toHaveLength(1);
  });

  it('died-too-old', () => {
    human('I1', 1594, 1712);
    expect(of(run(), 'died-too-old')).toHaveLength(1);
  });

  it('parents too young, and a parent too old', () => {
    human('UNG', 1780, null, { sex: 'F' });
    human('GAMMAL', 1700, null, { sex: 'M' });
    human('BARN', 1790, null);
    family('F1', 'GAMMAL', 'UNG', ['BARN']);
    const issues = run();
    expect(of(issues, 'parents-too-young')).toHaveLength(1); // 10 år
    expect(of(issues, 'parent-too-old')).toHaveLength(1); // 90 år
  });

  it('siblings born close together — full dates required, twins excepted', () => {
    person('A'); event('A', 'BIRT', '30 DEC 1934');
    person('B'); event('B', 'BIRT', '1 JUN 1935');   // 153 dagar → flaggas
    person('D'); event('D', 'BIRT', '1940');          // grovt datum → hoppas över
    family('F1', null, null, ['A', 'B', 'D']);
    // tvillingar i egen familj: 0 dagar isär → flaggas inte
    person('T1'); event('T1', 'BIRT', '4 MAY 1900');
    person('T2'); event('T2', 'BIRT', '4 MAY 1900');
    family('F2', null, null, ['T1', 'T2']);
    const hits = of(run(), 'siblings-born-too-close');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds.sort()).toEqual(['A', 'B']);
  });

  it('a large spouse age gap, married too young, and died too young to have married', () => {
    human('MAN', 1675, 1676, { sex: 'M' });
    human('KVINNA', 1614, null, { sex: 'F' });
    const f = family('F1', 'MAN', 'KVINNA');
    event(f, 'MARR', '1675', { ownerType: 'family' });
    const issues = run();
    expect(of(issues, 'large-spouse-age-gap')).toHaveLength(1); // 61 år
    expect(of(issues, 'married-too-young')).toHaveLength(1);                     // mannen 0 år
    expect(of(issues, 'died-too-young-to-marry')).toHaveLength(1);    // dog vid 1
  });

  it('more than one birth fact, and more than one death fact', () => {
    person('I1');
    event('I1', 'BIRT', '1800');
    event('I1', 'BIRT', '1801');
    event('I1', 'DEAT', '1860');
    event('I1', 'DEAT', '1861');
    const issues = run();
    expect(of(issues, 'multiple-births')).toHaveLength(1);
    expect(of(issues, 'multiple-deaths')).toHaveLength(1);
  });
});

describe('detectIssues — luckor', () => {
  it('missing birth, birth without a date, death without a date', () => {
    person('INGEN');                               // saknar födelse
    person('UTAN_DATUM'); event('UTAN_DATUM', 'BIRT', null);
    person('DÖD'); event('DÖD', 'BIRT', '1800'); event('DÖD', 'DEAT', null);
    const issues = run();
    expect(of(issues, 'missing-birth').map(i => i.personIds[0])).toEqual(['INGEN']);
    expect(of(issues, 'birth-without-date').map(i => i.personIds[0])).toEqual(['UTAN_DATUM']);
    expect(of(issues, 'death-without-date').map(i => i.personIds[0])).toEqual(['DÖD']);
  });
});

describe('detectIssues — family and names', () => {
  it('duplicate-marriage', () => {
    human('M', 1800, null, { sex: 'M' });
    human('K', 1802, null, { sex: 'F' });
    const f = family('F1', 'M', 'K');
    event(f, 'MARR', '1820', { ownerType: 'family' });
    event(f, 'MARR', '1821', { ownerType: 'family' });
    expect(of(run(), 'duplicate-marriage')).toHaveLength(1);
  });

  it('married-name-as-surname', () => {
    person('M', { surname: 'Le Blanc', sex: 'M' });
    person('K', { surname: 'Le Blanc', sex: 'F' });
    family('F1', 'M', 'K');
    const hits = of(run(), 'married-name-as-surname');
    expect(hits).toHaveLength(1);
    expect(hits[0].personIds[0]).toBe('K');
  });

  it('siblings sharing a given name requires the names to be identical', () => {
    human('A', 1700, null, { given: 'Margareta' });
    human('B', 1705, null, { given: 'Margareta' });
    human('C', 1710, null, { given: 'Margareta Elisabet' }); // annat förnamn → ingen träff
    family('F1', null, null, ['A', 'B', 'C']);
    const hits = of(run(), 'siblings-share-given-name');
    expect(hits).toHaveLength(2); // ett per syskon i paret A/B
    expect(hits.map(h => h.personIds[0]).sort()).toEqual(['A', 'B']);
  });

  it('a name reused after a sibling died is not flagged', () => {
    human('DÖD', 1700, 1704, { given: 'Margareta' });
    human('UPPKALLAD', 1705, null, { given: 'Margareta' }); // född efter systerns död
    family('F1', null, null, ['DÖD', 'UPPKALLAD']);
    expect(of(run(), 'siblings-share-given-name')).toHaveLength(0);
  });

  it('double spaces, and odd capitalisation', () => {
    person('A', { given: 'Maria  Jakobsdotter' });
    person('B', { given: 'LIzbet' });
    person('C', { given: 'EddieEdward' });
    person('D', { given: 'Anna', surname: 'ANDERSSON' }); // rena versaler är ok
    const issues = run();
    expect(of(issues, 'double-space-in-name').map(i => i.personIds[0])).toEqual(['A']);
    expect(of(issues, 'odd-capitalisation').map(i => i.personIds[0]).sort()).toEqual(['B', 'C']);
  });

  it('possible spelling variants of surnames and place names', () => {
    // 'Bergqvist' x3 vs 'Bergqvist,' x1  → efternamnsvariant
    for (const id of ['A', 'B', 'C']) person(id, { surname: 'Bergqvist' });
    person('D', { surname: 'Bergqvist,' });
    for (const id of ['E', 'F', 'G']) { person(id); event(id, 'BURI', '1900', { place: 'Bjuråkers kyrka' }); }
    person('H'); event('H', 'BURI', '1901', { place: 'Bjuråkers kyka' });
    const issues = run();
    expect(of(issues, 'inconsistent-surname-spelling').map(i => i.personIds[0])).toEqual(['D']);
    expect(of(issues, 'inconsistent-place-spelling').map(i => i.personIds[0])).toEqual(['H']);
  });

  it('a two-digit year, and a place that looks like a date', () => {
    person('A'); event('A', 'BIRT', '16');
    person('B'); event('B', 'MARR', '1785', { place: '18 Mar 1785' });
    const issues = run();
    expect(of(issues, 'two-digit-year')).toHaveLength(1);
    expect(of(issues, 'place-looks-like-date')).toHaveLength(1);
  });
});

describe('detectIssues — dubbletter', () => {
  it('groups on name plus birth year, and grades the confidence', () => {
    human('P1', 1750, null, { sex: 'M' });
    human('P2', 1752, null, { sex: 'F' });
    human('A1', 1779, null, { given: 'Anders', surname: 'Johansson' });
    human('A2', 1779, null, { given: 'anders', surname: ' Johansson' }); // normaliseras lika
    family('F1', 'P1', 'P2', ['A1', 'A2']);                             // samma föräldrar → high
    human('B1', 1800, null, { given: 'Karin', surname: 'Eriksdotter' });
    human('B2', 1800, null, { given: 'Karin', surname: 'Eriksdotter' }); // inga föräldrar → review
    const hits = of(run(), 'possible-duplicate');
    expect(hits).toHaveLength(4); // ett per medlem
    const high = hits.filter(h => h.duplicateGroup?.confidence === 'high');
    expect(high.map(h => h.personIds[0]).sort()).toEqual(['A1', 'A2']);
    expect(high[0].duplicateGroup!.ids.sort()).toEqual(['A1', 'A2']);
    const review = hits.filter(h => h.duplicateGroup?.confidence === 'review');
    expect(review.map(h => h.personIds[0]).sort()).toEqual(['B1', 'B2']);
  });

  it('does not group people who have no birth year', () => {
    human('X1', null, null, { given: 'Okänd', surname: 'Person' });
    human('X2', null, null, { given: 'Okänd', surname: 'Person' });
    expect(of(run(), 'possible-duplicate')).toHaveLength(0);
  });
});

describe('detectIssues — fingerprints and exceptions', () => {
  it('reports the same problem once, even when the facts are duplicated in the data', () => {
    human('I1', 1800, 1880);
    // fyra identiska bosättningar efter dödsåret — ett problem, inte fyra
    for (let i = 0; i < 4; i++) event('I1', 'RESI', '1890');
    const hits = of(run(), 'fact-after-death');
    expect(hits).toHaveLength(1);
  });

  it('gives every card a unique key of fingerprint plus owner', () => {
    human('I1', 1800, 1880);
    for (let i = 0; i < 3; i++) event('I1', 'RESI', '1890');
    human('D1', 1900, null, { given: 'Anna', surname: 'Andersson' });
    human('D2', 1900, null, { given: 'Anna', surname: 'Andersson' });
    const keys = run().map(i => `${i.fingerprint}|${i.personIds[0]}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is stable between runs but changes when the values change', () => {
    human('I1', 1801, 1800);
    const first = of(run(), 'death-before-birth')[0].fingerprint;
    expect(of(run(), 'death-before-birth')[0].fingerprint).toBe(first);

    // samma person och kategori, andra årtal → nytt fingeravtryck (problemet
    // återuppstår med rätta även om det tidigare avfärdats)
    db = createDb(':memory:');
    eventId = 0;
    human('I1', 1805, 1802);
    expect(of(run(), 'death-before-birth')[0].fingerprint).not.toBe(first);
  });

  it('skips the MyHeritage placeholder I88888888', () => {
    person('I88888888', { given: 'Unassociated photos', surname: '' });
    expect(run()).toEqual([]);
  });

  it('reports nothing for a clean record', () => {
    human('I1', 1900, 1980, { given: 'Ren', surname: 'Person' });
    expect(cats(run())).toEqual([]);
  });
});

describe('summarizeByPerson', () => {
  it('gathers each person\'s problems, worst first', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', code: 'missing-birth', severity: 'warning', params: { name: 'Anna' }, personIds: ['I1'] },
      { fingerprint: 'b', code: 'death-before-birth', severity: 'error', params: { name: 'Anna', birth: 1801, death: 1800 }, personIds: ['I1'] },
      { fingerprint: 'c', code: 'siblings-share-given-name', severity: 'info', params: { name: 'Anders', sibling: 'Anders' }, personIds: ['I2'] },
    ];
    expect(summarizeByPerson(issues)).toEqual({
      I1: {
        severity: 'error',
        problems: [
          { severity: 'error', code: 'death-before-birth', params: { name: 'Anna', birth: 1801, death: 1800 } },
          { severity: 'warning', code: 'missing-birth', params: { name: 'Anna' } },
        ],
      },
      I2: {
        severity: 'info',
        problems: [{ severity: 'info', code: 'siblings-share-given-name', params: { name: 'Anders', sibling: 'Anders' } }],
      },
    });
  });

  it('marks everyone involved, not only the one who owns the queue entry', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', code: 'child-older-than-parents', severity: 'error', params: { child: 'Brita', parent: 'Per' }, personIds: ['C', 'P'] },
    ];
    const marks = summarizeByPerson(issues);
    expect(Object.keys(marks).sort()).toEqual(['C', 'P']);
    expect(marks.P!.problems).toEqual([{ severity: 'error', code: 'child-older-than-parents', params: { child: 'Brita', parent: 'Per' } }]);
  });

  it('keeps both problems when the category is the same', () => {
    const issues: Issue[] = [
      { fingerprint: 'a', code: 'death-without-date', severity: 'warning', params: { name: 'Anna' }, personIds: ['I1'] },
      { fingerprint: 'b', code: 'death-without-date', severity: 'warning', params: { name: 'Brita' }, personIds: ['I1'] },
    ];
    expect(summarizeByPerson(issues).I1!.problems).toHaveLength(2);
  });

  it('gives an empty register when nothing is wrong', () => {
    expect(summarizeByPerson([])).toEqual({});
  });
});
