import type { Db } from '../../db/client';
import { persons } from '../../db/schema';

export interface NameCount { name: string; count: number }
export interface NamesStats {
  femaleGiven: NameCount[];
  maleGiven: NameCount[];
  surnames: NameCount[];
  withGivenName: number;
  withSurname: number;
}

const TOP = 10;

/**
 * Only the first given name counts: 1 870 of 4 561 people carry more than one,
 * and "Anna Margareta" is an Anna.
 */
export function firstGivenName(givenName: string): string {
  return givenName.trim().split(/\s+/)[0] ?? '';
}

function rank(counts: Map<string, number>): NameCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv'))
    .slice(0, TOP);
}

export function getNames(db: Db, ids: Set<string> | null): NamesStats {
  const people = db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname, sex: persons.sex,
  }).from(persons).all().filter(p => !ids || ids.has(p.id));

  const female = new Map<string, number>();
  const male = new Map<string, number>();
  const surnames = new Map<string, number>();
  let withGivenName = 0;
  let withSurname = 0;

  for (const p of people) {
    const given = firstGivenName(p.givenName);
    if (given) {
      withGivenName += 1;
      const bucket = p.sex === 'F' ? female : p.sex === 'M' ? male : null;
      if (bucket) bucket.set(given, (bucket.get(given) ?? 0) + 1);
    }
    const surname = p.surname.trim();
    if (surname) {
      withSurname += 1;
      surnames.set(surname, (surnames.get(surname) ?? 0) + 1);
    }
  }

  return {
    femaleGiven: rank(female),
    maleGiven: rank(male),
    surnames: rank(surnames),
    withGivenName,
    withSurname,
  };
}
