import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { persons, families, familyChildren, events } from '../../db/schema';
import type { PersonName } from './types';
import { yearsByPerson } from './lives';

export interface FamilySize { familyId: string; husband: PersonName | null; wife: PersonName | null; children: number }
export interface AgeGap { familyId: string; husband: PersonName; wife: PersonName; gap: number }
export interface FamiliesStats {
  families: number;
  averageChildren: number | null;
  largestFamilies: FamilySize[];
  sizeDistribution: { children: number; families: number }[];
  marriageAge: { sex: 'F' | 'M'; averageAge: number; people: number }[];
  averageAgeGap: number | null;
  largestAgeGap: AgeGap | null;
  marriagesWithYear: number;
}

/** Anyone older than this at their wedding is a date error, not a late bloomer. */
const MAX_MARRIAGE_AGE = 100;

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

export function getFamilies(db: Db, ids: Set<string> | null): FamiliesStats {
  const byId = new Map<string, PersonName & { sex: 'F' | 'M' | 'U' }>(
    db.select({ id: persons.id, givenName: persons.givenName, surname: persons.surname, sex: persons.sex })
      .from(persons).all().map(p => [p.id, p]),
  );
  const name = (id: string | null): PersonName | null => {
    const p = id ? byId.get(id) : undefined;
    return p ? { id: p.id, givenName: p.givenName, surname: p.surname } : null;
  };

  // A family belongs to the scope when either spouse does.
  const inScope = (f: { husbandId: string | null; wifeId: string | null }) =>
    !ids || (!!f.husbandId && ids.has(f.husbandId)) || (!!f.wifeId && ids.has(f.wifeId));

  const rows = db.select().from(families).all().filter(inScope);
  const childCounts = new Map<string, number>();
  for (const link of db.select({ familyId: familyChildren.familyId }).from(familyChildren).all()) {
    childCounts.set(link.familyId, (childCounts.get(link.familyId) ?? 0) + 1);
  }
  const marriageYears = new Map<string, number>();
  for (const e of db.select({ ownerId: events.ownerId, dateYear: events.dateYear }).from(events)
    .where(and(eq(events.ownerType, 'family'), eq(events.type, 'MARR'))).all()) {
    if (e.dateYear != null && !marriageYears.has(e.ownerId)) marriageYears.set(e.ownerId, e.dateYear);
  }
  const births = yearsByPerson(db, 'BIRT');

  const sizes: FamilySize[] = rows.map(f => ({
    familyId: f.id,
    husband: name(f.husbandId),
    wife: name(f.wifeId),
    children: childCounts.get(f.id) ?? 0,
  }));

  const distribution = new Map<number, number>();
  for (const s of sizes) distribution.set(s.children, (distribution.get(s.children) ?? 0) + 1);

  const agesAtMarriage: { F: number[]; M: number[] } = { F: [], M: [] };
  const gaps: AgeGap[] = [];
  let marriagesWithYear = 0;

  for (const f of rows) {
    const married = marriageYears.get(f.id);
    if (married != null) {
      marriagesWithYear += 1;
      for (const spouseId of [f.husbandId, f.wifeId]) {
        const spouse = spouseId ? byId.get(spouseId) : undefined;
        const born = spouseId ? births.get(spouseId) : undefined;
        if (!spouse || born == null || spouse.sex === 'U') continue;
        const age = married - born;
        if (age >= 0 && age <= MAX_MARRIAGE_AGE) agesAtMarriage[spouse.sex].push(age);
      }
    }
    const husbandBorn = f.husbandId ? births.get(f.husbandId) : undefined;
    const wifeBorn = f.wifeId ? births.get(f.wifeId) : undefined;
    if (f.husbandId && f.wifeId && husbandBorn != null && wifeBorn != null) {
      gaps.push({
        familyId: f.id,
        husband: name(f.husbandId)!,
        wife: name(f.wifeId)!,
        gap: Math.abs(husbandBorn - wifeBorn),
      });
    }
  }

  const marriageAge = (['F', 'M'] as const)
    .map(sex => ({ sex, averageAge: mean(agesAtMarriage[sex]), people: agesAtMarriage[sex].length }))
    .filter((r): r is { sex: 'F' | 'M'; averageAge: number; people: number } => r.averageAge !== null);

  return {
    families: rows.length,
    averageChildren: mean(sizes.map(s => s.children)),
    largestFamilies: [...sizes].sort((a, b) => b.children - a.children).slice(0, 5),
    sizeDistribution: [...distribution.entries()].sort((a, b) => a[0] - b[0])
      .map(([children, count]) => ({ children, families: count })),
    marriageAge,
    averageAgeGap: mean(gaps.map(g => g.gap)),
    largestAgeGap: gaps.length ? gaps.reduce((a, b) => (b.gap > a.gap ? b : a)) : null,
    marriagesWithYear,
  };
}
