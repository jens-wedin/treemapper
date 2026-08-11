import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons, families, familyChildren } from '../../db/schema';
import { relativesOf } from './relatives';

let db: Db;

/** mormor → mor → jag → barn → barnbarn, plus jag's sibling and an unrelated pair. */
function buildTree() {
  db.insert(persons).values(
    ['mormor', 'mor', 'jag', 'syskon', 'barn', 'barnbarn', 'utomstående', 'far']
      .map(id => ({ id, givenName: id, surname: 'X', sex: 'U' as const })),
  ).run();
  db.insert(families).values([
    { id: 'F1', husbandId: null, wifeId: 'mormor' },      // mormor → mor
    { id: 'F2', husbandId: 'far', wifeId: 'mor' },        // far+mor → jag, syskon
    { id: 'F3', husbandId: 'jag', wifeId: null },         // jag → barn
    { id: 'F4', husbandId: 'barn', wifeId: null },        // barn → barnbarn
  ]).run();
  db.insert(familyChildren).values([
    { familyId: 'F1', childId: 'mor', seq: 0 },
    { familyId: 'F2', childId: 'jag', seq: 0 },
    { familyId: 'F2', childId: 'syskon', seq: 1 },
    { familyId: 'F3', childId: 'barn', seq: 0 },
    { familyId: 'F4', childId: 'barnbarn', seq: 0 },
  ]).run();
}

beforeEach(() => { db = createDb(':memory:'); buildTree(); });

describe('relativesOf', () => {
  it('includes one\'s own ancestors and descendants, but not siblings or outsiders', () => {
    const set = relativesOf(db, 'jag')!;
    expect([...set].sort()).toEqual(['barn', 'barnbarn', 'far', 'jag', 'mor', 'mormor']);
    expect(set.has('syskon')).toBe(false);
    expect(set.has('utomstående')).toBe(false);
  });

  it('gives only the person themselves when there is no family', () => {
    expect([...relativesOf(db, 'utomstående')!]).toEqual(['utomstående']);
  });

  it('gives null for an unknown person', () => {
    expect(relativesOf(db, 'finns-inte')).toBeNull();
  });

  it('does not hang when somebody is their own ancestor', () => {
    // självförälderskap finns som konsekvenskategori i riktiga data
    db.insert(families).values({ id: 'F9', husbandId: 'barnbarn', wifeId: null }).run();
    db.insert(familyChildren).values({ familyId: 'F9', childId: 'mormor', seq: 0 }).run();
    const set = relativesOf(db, 'jag')!;
    expect(set.has('mormor')).toBe(true);
    expect(set.size).toBeLessThan(20);       // terminated rather than looping
  });
});
