import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { persons, events } from '../../db/schema';
import type { PersonName } from './types';

/**
 * Anything above this is a date error, not a long life. The real database has
 * three such people, topping out at 118, and Konsekvensbänken already flags
 * them — a statistics page must not present one as a fun fact.
 */
export const MAX_PLAUSIBLE_AGE = 110;

export interface LifeSpan extends PersonName { birthYear: number; deathYear: number; age: number }
export interface LivesStats {
  total: number;
  bySex: { F: number; M: number; U: number };
  earliestBirthYear: number | null;
  latestBirthYear: number | null;
  withBothYears: number;
  longestLives: LifeSpan[];
  lifespanByCentury: { century: number; averageAge: number; people: number }[];
  birthsByCentury: { century: number; births: number }[];
}

const centuryOf = (year: number) => Math.floor(year / 100) * 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** First recorded year per person for a given event tag. */
export function yearsByPerson(db: Db, type: 'BIRT' | 'DEAT'): Map<string, number> {
  const rows = db.select({ ownerId: events.ownerId, dateYear: events.dateYear })
    .from(events)
    .where(and(eq(events.ownerType, 'person'), eq(events.type, type)))
    .all();
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.dateYear == null) continue;
    const seen = out.get(row.ownerId);
    if (seen == null || row.dateYear < seen) out.set(row.ownerId, row.dateYear);
  }
  return out;
}

export function getLives(db: Db, ids: Set<string> | null): LivesStats {
  const people = db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname, sex: persons.sex,
  }).from(persons).all().filter(p => !ids || ids.has(p.id));

  const births = yearsByPerson(db, 'BIRT');
  const deaths = yearsByPerson(db, 'DEAT');

  const bySex = { F: 0, M: 0, U: 0 };
  const birthYears: number[] = [];
  const spans: LifeSpan[] = [];
  for (const p of people) {
    bySex[p.sex] += 1;
    const birth = births.get(p.id);
    const death = deaths.get(p.id);
    if (birth != null) birthYears.push(birth);
    if (birth == null || death == null) continue;
    const age = death - birth;
    if (age < 0 || age > MAX_PLAUSIBLE_AGE) continue;
    spans.push({ id: p.id, givenName: p.givenName, surname: p.surname, birthYear: birth, deathYear: death, age });
  }

  const byCentury = new Map<number, number[]>();
  for (const s of spans) {
    const c = centuryOf(s.birthYear);
    byCentury.set(c, [...(byCentury.get(c) ?? []), s.age]);
  }
  const birthCounts = new Map<number, number>();
  for (const year of birthYears) {
    const c = centuryOf(year);
    birthCounts.set(c, (birthCounts.get(c) ?? 0) + 1);
  }

  return {
    total: people.length,
    bySex,
    earliestBirthYear: birthYears.length ? Math.min(...birthYears) : null,
    latestBirthYear: birthYears.length ? Math.max(...birthYears) : null,
    withBothYears: spans.length,
    longestLives: [...spans].sort((a, b) => b.age - a.age).slice(0, 5),
    lifespanByCentury: [...byCentury.entries()].sort((a, b) => a[0] - b[0])
      .map(([century, ages]) => ({
        century,
        averageAge: round1(ages.reduce((s, a) => s + a, 0) / ages.length),
        people: ages.length,
      })),
    birthsByCentury: [...birthCounts.entries()].sort((a, b) => a[0] - b[0])
      .map(([century, births]) => ({ century, births })),
  };
}
