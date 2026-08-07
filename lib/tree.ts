import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren, media, events } from '../db/schema';
import { countryFromPlace } from './places';

export interface TreePerson {
  id: string;
  givenName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  /** Raw GEDCOM dates, for views that show more than the year. */
  birthDate: string | null;
  deathDate: string | null;
  sex: 'M' | 'F' | 'U';
  /** Downloaded photo to show on the chart card, if the person has one. */
  photoId: number | null;
  /** Country of birth, only when the birth place explicitly names one. */
  country: string | null;
}
export interface AncestorNode {
  person: TreePerson;
  parents: AncestorNode[];
  /**
   * True when the chart stopped here but the database holds parents further
   * back — lets a view offer "continue from this person" instead of implying
   * the line ends.
   */
  hasMoreAncestors?: boolean;
}
export interface DescendantNode {
  person: TreePerson;
  /** Partners shown beside the person; their shared children hang below. */
  spouses: TreePerson[];
  children: DescendantNode[];
  /**
   * Which of the parent's families this person came from (index into the
   * parent's `spouses`). Keeps children of a second marriage hanging from the
   * right couple instead of the first one.
   */
  familyIndex: number;
}
export interface TreeData { focus: TreePerson; ancestors: AncestorNode; descendants: DescendantNode }

// Raw persons.id qualifier — see the drizzle-rendering gotcha in lib/queries.ts.
const birthYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'BIRT')`;
const deathYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'DEAT')`;
const birthDateSql = sql<string | null>`(select e.date_raw from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'BIRT' and e.date_raw is not null limit 1)`;
const deathDateSql = sql<string | null>`(select e.date_raw from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'DEAT' and e.date_raw is not null limit 1)`;

/**
 * Picks one photo per person for the chart: MyHeritage's primary photo
 * (`_PRIM Y`, kept in raw_tags) when there is one, otherwise the first
 * downloaded photo. Photos that never downloaded are skipped.
 */
function fetchPhotoIds(db: Db, ids: string[]): Map<string, number> {
  const rows = db.select({ id: media.id, ownerId: media.ownerId, rawTags: media.rawTags })
    .from(media)
    .where(and(
      eq(media.ownerType, 'person'),
      eq(media.downloadStatus, 'done'),
      inArray(media.ownerId, ids),
    ))
    .orderBy(asc(media.id))
    .all();

  const best = new Map<string, { id: number; primary: boolean }>();
  for (const row of rows) {
    const primary = /"_PRIM"/.test(row.rawTags ?? '') && /"value"\s*:\s*"Y"/.test(row.rawTags ?? '');
    const current = best.get(row.ownerId);
    if (!current || (primary && !current.primary)) {
      best.set(row.ownerId, { id: row.id, primary });
    }
  }
  return new Map([...best].map(([ownerId, v]) => [ownerId, v.id]));
}

/**
 * Country per person, from the birth place only — christening and baptism
 * count as birth-locale events when there is no birth place. Later events
 * (residence, death) are deliberately ignored: they can name a different
 * country than the person was born in.
 */
const BIRTH_LOCALE_TAGS = ['BIRT', 'CHR', 'BAPM'];

function fetchCountries(db: Db, ids: string[]): Map<string, string> {
  const rows = db.select({ ownerId: events.ownerId, type: events.type, place: events.place })
    .from(events)
    .where(and(
      eq(events.ownerType, 'person'),
      inArray(events.ownerId, ids),
      inArray(events.type, BIRTH_LOCALE_TAGS),
    ))
    .orderBy(asc(events.id))
    .all();

  const byPerson = new Map<string, string>();
  for (const tag of BIRTH_LOCALE_TAGS) {
    for (const row of rows) {
      if (row.type !== tag || byPerson.has(row.ownerId)) continue;
      const country = countryFromPlace(row.place);
      if (country) byPerson.set(row.ownerId, country);
    }
  }
  return byPerson;
}

function fetchPersons(db: Db, ids: string[]): Map<string, TreePerson> {
  if (!ids.length) return new Map();
  const rows = db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname,
    birthYear: birthYearSql, deathYear: deathYearSql,
    birthDate: birthDateSql, deathDate: deathDateSql,
    sex: persons.sex,
  }).from(persons).where(inArray(persons.id, ids)).all();
  const photos = fetchPhotoIds(db, ids);
  const countries = fetchCountries(db, ids);
  return new Map(rows.map(r => [r.id, {
    ...r,
    photoId: photos.get(r.id) ?? null,
    country: countries.get(r.id) ?? null,
  }]));
}

function parentIdsOf(db: Db, id: string): string[] {
  const links = db.select().from(familyChildren).where(eq(familyChildren.childId, id)).all();
  if (!links.length) return [];
  const fams = db.select().from(families).where(inArray(families.id, links.map(l => l.familyId))).all();
  return fams.flatMap(f => [f.husbandId, f.wifeId]).filter((x): x is string => !!x);
}

/** Each family the person is a spouse in: the partner and that family's children. */
function familiesOf(db: Db, id: string): { spouseId: string | null; childIds: string[] }[] {
  const fams = db.select().from(families)
    .where(or(eq(families.husbandId, id), eq(families.wifeId, id))).all()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!fams.length) return [];
  const links = db.select().from(familyChildren).where(inArray(familyChildren.familyId, fams.map(f => f.id))).all();
  return fams.map(f => {
    const spouseId = f.husbandId === id ? f.wifeId : f.husbandId;
    return {
      spouseId: spouseId && spouseId !== id ? spouseId : null,
      childIds: links.filter(l => l.familyId === f.id).sort((a, b) => a.seq - b.seq).map(l => l.childId),
    };
  });
}

/**
 * Assembles the chart payload: ancestors up and descendants down from the
 * focus person. Cycle guard: a person already on the current path is not
 * expanded again (self-ancestry exists as a Konsekvens category in the data —
 * this must never hang).
 */
export function getTree(db: Db, id: string, up = 3, down = 3): TreeData | null {
  const focus = fetchPersons(db, [id]).get(id);
  if (!focus) return null;

  const ancestors = (person: TreePerson, depth: number, pathIds: Set<string>): AncestorNode => {
    if (depth <= 0) {
      const beyond = parentIdsOf(db, person.id).filter(p => !pathIds.has(p));
      return { person, parents: [], hasMoreAncestors: beyond.length > 0 };
    }
    const ids = parentIdsOf(db, person.id).filter(p => !pathIds.has(p));
    const byId = fetchPersons(db, ids);
    return {
      person,
      parents: ids.map(pid => byId.get(pid)).filter((p): p is TreePerson => !!p)
        .map(p => ancestors(p, depth - 1, new Set([...pathIds, person.id]))),
    };
  };
  const descendants = (person: TreePerson, depth: number, pathIds: Set<string>, familyIndex = 0): DescendantNode => {
    // Partners are shown beside a person we are expanding — at the deepest
    // generation we stop, otherwise the chart doubles in width for no gain.
    if (depth <= 0) return { person, spouses: [], children: [], familyIndex };

    const fams = familiesOf(db, person.id);
    const childIds = fams.flatMap(f => f.childIds).filter(c => !pathIds.has(c));
    const spouseIds = fams.map(f => f.spouseId).filter((s): s is string => !!s);
    const byId = fetchPersons(db, [...childIds, ...spouseIds]);
    const nextPath = new Set([...pathIds, person.id]);

    const children: DescendantNode[] = [];
    fams.forEach((fam, i) => {
      for (const cid of fam.childIds) {
        const child = pathIds.has(cid) ? undefined : byId.get(cid);
        if (child) children.push(descendants(child, depth - 1, nextPath, i));
      }
    });

    return {
      person,
      spouses: fams.map(f => (f.spouseId ? byId.get(f.spouseId) : undefined))
        .filter((s): s is TreePerson => !!s),
      children,
      familyIndex,
    };
  };

  return {
    focus,
    ancestors: ancestors(focus, up, new Set([id])),
    descendants: descendants(focus, down, new Set([id])),
  };
}
