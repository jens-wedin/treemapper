import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { persons } from '../../db/schema';
import type { PersonName } from './types';
import { relativesOf } from './relatives';
import { getLives, type LivesStats } from './lives';
import { getNames, type NamesStats } from './names';
import { getFamilies, type FamiliesStats } from './families';
import { getPlaces, type PlacesStats } from './places';

export interface StatisticsScope { kind: 'all' | 'person'; person: PersonName | null; people: number }
export interface StatisticsData {
  scope: StatisticsScope;
  lives: LivesStats;
  names: NamesStats;
  families: FamiliesStats;
  places: PlacesStats;
}

/** `personId` narrows every section to that person's own ancestors and descendants. */
export function getStatistics(db: Db, personId?: string): StatisticsData | null {
  let ids: Set<string> | null = null;
  let person: PersonName | null = null;

  if (personId) {
    ids = relativesOf(db, personId);
    if (!ids) return null;
    const row = db.select({ id: persons.id, givenName: persons.givenName, surname: persons.surname })
      .from(persons).where(eq(persons.id, personId)).get();
    person = row ?? null;
  }

  const lives = getLives(db, ids);
  return {
    scope: { kind: personId ? 'person' : 'all', person, people: lives.total },
    lives,
    names: getNames(db, ids),
    families: getFamilies(db, ids),
    places: getPlaces(db, ids),
  };
}

export type { PersonName } from './types';
export type { LivesStats, LifeSpan } from './lives';
export type { NamesStats, NameCount } from './names';
export type { FamiliesStats, FamilySize, AgeGap } from './families';
export type { PlacesStats, PlaceCount, Migration } from './places';
