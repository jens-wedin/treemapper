import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons, families, familyChildren, events } from '../../db/schema';
import { getFamilies } from './families';

let db: Db;
const person = (id: string, sex: 'F' | 'M' | 'U', birth?: number) => {
  db.insert(persons).values({ id, givenName: id, surname: 'X', sex }).run();
  if (birth !== undefined) db.insert(events).values({ ownerType: 'person', ownerId: id, type: 'BIRT', dateYear: birth }).run();
};
const family = (id: string, husbandId: string | null, wifeId: string | null, childIds: string[], marriedIn?: number) => {
  db.insert(families).values({ id, husbandId, wifeId }).run();
  childIds.forEach((childId, seq) => db.insert(familyChildren).values({ familyId: id, childId, seq }).run());
  if (marriedIn !== undefined) db.insert(events).values({ ownerType: 'family', ownerId: id, type: 'MARR', dateYear: marriedIn }).run();
};

beforeEach(() => { db = createDb(':memory:'); });

describe('getFamilies', () => {
  it('rangordnar de största familjerna och namnger paret', () => {
    person('far', 'M'); person('mor', 'F');
    person('a', 'U'); person('b', 'U'); person('c', 'U');
    family('F1', 'far', 'mor', ['a', 'b', 'c']);
    family('F2', 'far', null, ['a']);
    const r = getFamilies(db, null);
    expect(r.largestFamilies[0]).toMatchObject({ familyId: 'F1', children: 3 });
    expect(r.largestFamilies[0]!.husband).toMatchObject({ id: 'far' });
    expect(r.largestFamilies[0]!.wife).toMatchObject({ id: 'mor' });
    expect(r.families).toBe(2);
    expect(r.averageChildren).toBe(2);
  });

  it('ger fördelningen av familjestorlekar', () => {
    person('a', 'U'); person('b', 'U');
    family('F1', 'a', null, []);
    family('F2', 'b', null, ['a']);
    family('F3', 'a', null, ['b']);
    expect(getFamilies(db, null).sizeDistribution).toEqual([
      { children: 0, families: 1 },
      { children: 1, families: 2 },
    ]);
  });

  it('räknar giftasålder var för sig för kvinnor och män', () => {
    person('man', 'M', 1800);
    person('kvinna', 'F', 1810);
    family('F1', 'man', 'kvinna', [], 1830);          // man 30, kvinna 20
    const r = getFamilies(db, null);
    expect(r.marriageAge).toEqual([
      { sex: 'F', averageAge: 20, people: 1 },
      { sex: 'M', averageAge: 30, people: 1 },
    ]);
    expect(r.marriagesWithYear).toBe(1);
  });

  it('ger genomsnittlig och största åldersskillnad i paret', () => {
    person('m1', 'M', 1800); person('k1', 'F', 1802);   // 2 år
    person('m2', 'M', 1800); person('k2', 'F', 1820);   // 20 år
    family('F1', 'm1', 'k1', []);
    family('F2', 'm2', 'k2', []);
    const r = getFamilies(db, null);
    expect(r.averageAgeGap).toBe(11);
    expect(r.largestAgeGap).toMatchObject({ familyId: 'F2', gap: 20 });
  });

  it('hoppar över par där ett födelseår saknas', () => {
    person('m', 'M', 1800); person('k', 'F');
    family('F1', 'm', 'k', [], 1830);
    const r = getFamilies(db, null);
    expect(r.marriageAge).toEqual([{ sex: 'M', averageAge: 30, people: 1 }]);
    expect(r.averageAgeGap).toBeNull();
    expect(r.largestAgeGap).toBeNull();
  });

  it('tar med en familj om någon av makarna finns i avgränsningen', () => {
    person('inne', 'M'); person('ute', 'F'); person('x', 'U');
    family('F1', 'inne', 'ute', ['x']);
    family('F2', 'ute', null, ['x']);
    const r = getFamilies(db, new Set(['inne']));
    expect(r.families).toBe(1);
    expect(r.largestFamilies[0]!.familyId).toBe('F1');
  });

  it('klarar en databas utan familjer utan att dela med noll', () => {
    const r = getFamilies(db, null);
    expect(r.families).toBe(0);
    expect(r.averageChildren).toBeNull();
    expect(r.averageAgeGap).toBeNull();
    expect(r.largestFamilies).toEqual([]);
    expect(r.marriageAge).toEqual([]);
  });
});
