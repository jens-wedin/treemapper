import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { persons, events } from '../../db/schema';
import { countryFromPlace } from '../places';
import type { PersonName } from './types';

export interface PlaceCount { place: string; count: number }
export interface Migration extends PersonName { type: 'IMMI' | 'EMIG'; year: number | null; place: string | null }
export interface PlacesStats {
  birthPlaces: PlaceCount[];
  countries: PlaceCount[];
  occupations: PlaceCount[];
  migrations: Migration[];
  withBirthPlace: number;
}

const TOP = 10;

/**
 * Group places by their most specific part. "Alnö, Västernorrland, Sundsvall,
 * Sverige" and a bare "Alnö" are the same place and must count together.
 *
 * Deliberately approximate: it also reduces "Innegården, Berge 2, Nordanstig…"
 * to a farm and "Gävleborgs län, Sverige" to a county. Across 1 795 distinct
 * strings no rule is clean, which is why the UI says "birth places" and not
 * "parishes".
 */
export function placeKey(place: string): string {
  return place.split(',')[0]!.trim();
}

function rank(counts: Map<string, number>): PlaceCount[] {
  return [...counts.entries()]
    .map(([place, count]) => ({ place, count }))
    .sort((a, b) => b.count - a.count || a.place.localeCompare(b.place, 'sv'))
    .slice(0, TOP);
}

export function getPlaces(db: Db, ids: Set<string> | null): PlacesStats {
  const names = new Map<string, PersonName>(
    db.select({ id: persons.id, givenName: persons.givenName, surname: persons.surname })
      .from(persons).all().map(p => [p.id, p]),
  );

  const rows = db.select({
    ownerId: events.ownerId, type: events.type, place: events.place,
    description: events.description, dateYear: events.dateYear,
  }).from(events)
    .where(and(eq(events.ownerType, 'person'), inArray(events.type, ['BIRT', 'OCCU', 'IMMI', 'EMIG'])))
    .all()
    .filter(e => !ids || ids.has(e.ownerId));

  const birthPlaces = new Map<string, number>();
  const countries = new Map<string, number>();
  const occupations = new Map<string, number>();
  const occupationLabels = new Map<string, string>();      // lowercase key → first spelling seen
  const migrations: Migration[] = [];
  let withBirthPlace = 0;

  for (const e of rows) {
    if (e.type === 'BIRT' && e.place) {
      withBirthPlace += 1;
      const key = placeKey(e.place);
      if (key) birthPlaces.set(key, (birthPlaces.get(key) ?? 0) + 1);
      const country = countryFromPlace(e.place);
      if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
    }
    if (e.type === 'OCCU' && e.description) {
      const key = e.description.trim().toLowerCase();
      if (!key) continue;
      if (!occupationLabels.has(key)) occupationLabels.set(key, e.description.trim());
      occupations.set(key, (occupations.get(key) ?? 0) + 1);
    }
    if (e.type === 'IMMI' || e.type === 'EMIG') {
      const who = names.get(e.ownerId);
      if (who) migrations.push({ ...who, type: e.type, year: e.dateYear, place: e.place });
    }
  }

  return {
    birthPlaces: rank(birthPlaces),
    countries: rank(countries),
    occupations: rank(occupations).map(o => ({ place: occupationLabels.get(o.place) ?? o.place, count: o.count })),
    migrations: migrations.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    withBirthPlace,
  };
}
