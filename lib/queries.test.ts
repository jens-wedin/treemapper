import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren } from '../db/schema';
import { searchPersons, getPersonFull } from './queries';

const fixture = fileURLToPath(new URL('./gedcom/fixtures/mini.ged', import.meta.url));
let dir: string;
let db: Db;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-queries-'));
  const dbPath = path.join(dir, 'q.db');
  runImport(fixture, dbPath);
  db = createDb(dbPath);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('searchPersons', () => {
  it('finds by surname and married name, with birth/death years and birth place', () => {
    const { items, total } = searchPersons(db, { q: 'Wedin' });
    // Sven-Erik Wedin + Anna Larsson (gift Wedin)
    expect(total).toBe(2);
    expect(items.map(i => i.id).sort()).toEqual(['I1', 'I2']);
    const i1 = items.find(i => i.id === 'I1')!;
    expect(i1).toMatchObject({
      givenName: 'Sven-Erik', surname: 'Wedin',
      birthYear: 1942, birthPlace: 'Gävleborgs län, Sverige',
    });
  });

  it('finds by full name', () => {
    expect(searchPersons(db, { q: 'Sven-Erik Wedin' }).total).toBe(1);
  });

  it('filters by birth year and place', () => {
    expect(searchPersons(db, { birthYear: 1942 }).total).toBe(1);
    expect(searchPersons(db, { birthYear: 1900 }).total).toBe(0);
    expect(searchPersons(db, { place: 'Gävleborg' }).total).toBe(1);
  });

  it('returns everyone unfiltered, paginated', () => {
    const all = searchPersons(db, {});
    expect(all.total).toBe(3);
    const page = searchPersons(db, { limit: 2, offset: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
  });
});

describe('getPersonFull', () => {
  it('returns null for unknown id', () => {
    expect(getPersonFull(db, 'I999')).toBeNull();
  });

  it('assembles person, sorted events with citations, media, and note', () => {
    const full = getPersonFull(db, 'I1')!;
    expect(full.person).toMatchObject({ id: 'I1', givenName: 'Sven-Erik', surname: 'Wedin', sex: 'M' });
    expect(full.person.note).toContain('En anteckning');
    expect(full.events.map(e => e.type)).toEqual(['BIRT', 'OCCU']); // 1942 before 1965
    const birt = full.events[0];
    expect(birt.citations).toHaveLength(1);
    expect(birt.citations[0]).toMatchObject({ sourceId: 'S1', sourceTitle: 'Kyrkbok Hälsingland', page: 'Sida 12', quality: 3 });
    expect(full.media).toHaveLength(1);
    // fixture import leaves downloads pending → not yet available
    expect(full.media[0]).toMatchObject({ title: 'Porträtt', available: false });
  });

  it('assembles the family box from both directions', () => {
    const i1 = getPersonFull(db, 'I1')!;
    expect(i1.parents).toEqual([]);
    expect(i1.families).toHaveLength(1);
    expect(i1.families[0].spouse).toMatchObject({ id: 'I2' });
    expect(i1.families[0].marriage).toMatchObject({ dateYear: 1964, place: 'Stockholm, Sverige' });
    expect(i1.families[0].children.map(c => c.id)).toEqual(['I3']);

    const i3 = getPersonFull(db, 'I3')!;
    expect(i3.parents.map(p => p.id).sort()).toEqual(['I1', 'I2']);
    expect(i3.siblings).toEqual([]);
    expect(i3.personCitations).toHaveLength(1);
    expect(i3.personCitations[0].page).toBe('Sida 99');
  });
});

describe('getPersonFull — dubbla familjer', () => {
  it('räknar en förälder en gång även när barnet står i två familjer med samma mor', () => {
    // uppstår när en gren importerats två gånger: samma barn, två familjer,
    // samma mor i båda. Dubbla nycklar får React att tappa bort noder.
    db.insert(persons).values([
      { id: 'DF1', givenName: 'Far', surname: 'Dubbel', sex: 'M' },
      { id: 'DF2', givenName: 'Far2', surname: 'Dubbel', sex: 'M' },
      { id: 'DM', givenName: 'Mor', surname: 'Dubbel', sex: 'F' },
      { id: 'DC', givenName: 'Barn', surname: 'Dubbel', sex: 'U' },
    ]).run();
    db.insert(families).values([
      { id: 'DFA', husbandId: 'DF1', wifeId: 'DM' },
      { id: 'DFB', husbandId: 'DF2', wifeId: 'DM' },
    ]).run();
    db.insert(familyChildren).values([
      { familyId: 'DFA', childId: 'DC', seq: 0 },
      { familyId: 'DFB', childId: 'DC', seq: 0 },
    ]).run();

    const full = getPersonFull(db, 'DC')!;
    const ids = full.parents.map(p => p.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids.sort()).toEqual(['DF1', 'DF2', 'DM']);
  });
});
