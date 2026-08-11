import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events, citations, sources } from '../db/schema';
import { branchMembers, duplicateClusters } from './duplicateClusters';

let db: Db;
let seq = 0;

beforeEach(() => {
  db = createDb(':memory:');
  seq = 0;
  db.insert(sources).values({ id: 'S1', title: 'Källa' }).run();
});

function person(id: string, given: string, surname: string, born?: string) {
  db.insert(persons).values({ id, givenName: given, surname, sex: 'U' }).run();
  if (born) {
    db.insert(events).values({ id: ++seq, ownerType: 'person', ownerId: id, type: 'BIRT', dateRaw: born, dateYear: null }).run();
  }
  return id;
}
function family(id: string, husbandId: string | null, wifeId: string | null, children: string[] = []) {
  db.insert(families).values({ id, husbandId, wifeId }).run();
  children.forEach((c, i) => db.insert(familyChildren).values({ familyId: id, childId: c, seq: i }).run());
}
const cite = (ownerId: string) =>
  db.insert(citations).values({ id: ++seq + 500, ownerType: 'person', ownerId, sourceId: 'S1' }).run();

const all = () => branchMembers(db, ['H1']);
const clusters = () => duplicateClusters(db, all()).map(c => c.ids);

describe('branchMembers', () => {
  it('goes by both marriage and children', () => {
    person('H1', 'Anders', 'Ek', '1784');
    person('W1', 'Karin', 'Ek', '1789');
    person('C1', 'Jonas', 'Ek', '1810');
    person('SW', 'Brita', 'Ny', '1812');
    person('GC', 'Lars', 'Ek', '1840');
    family('F1', 'H1', 'W1', ['C1']);
    family('F2', 'C1', 'SW', ['GC']);
    expect([...all()].sort()).toEqual(['C1', 'GC', 'H1', 'SW', 'W1']);
  });
});

describe('duplicateClusters', () => {
  it('gathers every copy of the same person, best-evidenced first', () => {
    person('H1', 'Anders', 'Ek', '1784');
    person('W1', 'Karin', 'Ek', '1789');
    person('C1', 'Jonas', 'Ek', '11 NOV 1810');
    person('C2', 'Jonas', 'Ek', '11 NOV 1810');
    person('C3', 'Jonas', 'Ek', '11 NOV 1810');
    cite('C2'); cite('C2');
    family('F1', 'H1', 'W1', ['C1']);
    family('F2', 'H1', 'W1', ['C2']);
    family('F3', 'H1', 'W1', ['C3']);
    expect(clusters()).toEqual([['C2', 'C1', 'C3']]);
  });

  it('leaves twins alone', () => {
    person('H1', 'Anders', 'Ek', '1784');
    person('W1', 'Karin', 'Ek', '1789');
    person('T1', 'Anna', 'Ek', '12 JAN 1828');
    person('T2', 'Beata', 'Ek', '12 JAN 1828');
    family('F1', 'H1', 'W1', ['T1', 'T2']);
    expect(clusters()).toEqual([]);
  });

  it('pairs twin with twin when the family exists in two copies', () => {
    person('H1', 'Anders', 'Ek', '1784');
    person('W1', 'Karin', 'Ek', '1789');
    person('A1', 'Anna', 'Ek', '12 JAN 1828');
    person('B1', 'Beata', 'Ek', '12 JAN 1828');
    person('A2', 'Anna', 'Ek', '12 JAN 1828');
    person('B2', 'Beata', 'Ek', '12 JAN 1828');
    family('F1', 'H1', 'W1', ['A1', 'B1']);
    family('F2', 'H1', 'W1', ['A2', 'B2']);
    expect(clusters().map(c => [...c].sort())).toEqual([['A1', 'A2'], ['B1', 'B2']]);
  });

  it('recognises the same spouse despite a swapped name order', () => {
    person('H1', 'Jonas', 'Ek', '1834');
    person('W1', 'Brita', 'Jonsdotter Forss', '6 JUN 1838');
    person('W2', 'Brita', 'Fors Jonsdotter', '6 JUN 1838');
    family('F1', 'H1', 'W1');
    family('F2', 'H1', 'W2');
    expect(clusters().map(c => [...c].sort())).toEqual([['W1', 'W2']]);
  });

  it('does not merge namesakes that have no birth date', () => {
    person('H1', 'Anders', 'Ek', '1784');
    person('W1', 'Karin', 'Ek', '1789');
    person('U1', 'Okänd', 'Ek');
    person('U2', 'Okänd', 'Ek');
    family('F1', 'H1', 'W1', ['U1']);
    family('F2', 'H1', 'W1', ['U2']);
    expect(clusters()).toEqual([]);
  });

  it('joins groups that share a person', () => {
    // W1 matchar W2 på namn och W3 på partner — en klunga, inte två
    person('H1', 'Jonas', 'Ek', '1834');
    person('W1', 'Brita', 'Forss', '6 JUN 1838');
    person('W2', 'Brita', 'Forss', '6 JUN 1838');
    person('W3', 'Brita', 'Fors Jonsdotter', '6 JUN 1838');
    family('F1', 'H1', 'W1');
    family('F2', 'H1', 'W2');
    family('F3', 'H1', 'W3');
    const found = clusters();
    expect(found).toHaveLength(1);
    expect([...found[0]!].sort()).toEqual(['W1', 'W2', 'W3']);
  });
});
