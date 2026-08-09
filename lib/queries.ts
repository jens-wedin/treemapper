import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media } from '../db/schema';
import { buildPersonLog, type IssueLogEntry } from './issueLog';

export interface PersonListItem {
  id: string;
  givenName: string;
  surname: string;
  marriedName: string | null;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
}
export interface SearchParams { q?: string; birthYear?: number; place?: string; limit?: number; offset?: number }

export interface FamilyMember { id: string; givenName: string; surname: string; birthYear: number | null; deathYear: number | null }
export interface CitationView { id: number; sourceId: string; sourceTitle: string | null; page: string | null; quality: number | null; text: string | null }
export interface EventView { id: number; type: string; dateRaw: string | null; dateYear: number | null; place: string | null; description: string | null; age: string | null; citations: CitationView[] }
export interface MediaView { id: number; title: string | null; available: boolean }
/** The marriage carries its event id so the page can edit it in place. */
export interface MarriageView { id: number; dateRaw: string | null; dateYear: number | null; place: string | null; description: string | null }
export interface FamilyView { familyId: string; spouse: FamilyMember | null; marriage: MarriageView | null; children: FamilyMember[] }
export interface PersonFull {
  person: { id: string; givenName: string; surname: string; marriedName: string | null; suffix: string | null; sex: 'M' | 'F' | 'U'; note: string | null };
  events: EventView[];
  personCitations: CitationView[];
  media: MediaView[];
  parents: FamilyMember[];
  siblings: FamilyMember[];
  families: FamilyView[];
  /** What has been changed about this person, newest first. */
  log: IssueLogEntry[];
}

// Correlated scalar subqueries — avoid join-multiplication when a person has
// duplicate BIRT/DEAT events (dirty data is a fact of this tree).
// The outer-table qualifier must be raw: drizzle renders an interpolated
// ${persons.id} as unqualified "id", which the subquery resolves against
// events (e.owner_id = e.id) instead of the outer persons row.
const birthYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'BIRT')`;
const deathYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'DEAT')`;
const birthPlaceSql = sql<string | null>`(select e.place from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'BIRT' and e.place is not null limit 1)`;

export function searchPersons(db: Db, p: SearchParams): { items: PersonListItem[]; total: number } {
  const limit = Math.min(p.limit ?? 50, 200);
  const offset = p.offset ?? 0;
  const conds: (SQL | undefined)[] = [];
  if (p.q) {
    // Word by word, not as one string: "jens wedin" has to find "Erik Anders
    // Fredrik Lindqvist", and matching the query whole never could — the middle
    // names sit in the gap between the two words typed. Most people here carry
    // middle names, so the whole-string search quietly hid them and reported 0
    // with as much confidence as it reports 5.
    //
    // Every word must match somewhere (AND), each against any of the name
    // fields (OR). So a word that belongs to nobody still narrows the search
    // to nothing, rather than the search guessing at what was meant.
    for (const word of p.q.trim().split(/\s+/).filter(Boolean)) {
      const pat = `%${word}%`;
      conds.push(or(
        like(persons.givenName, pat),
        like(persons.surname, pat),
        like(persons.marriedName, pat),
      ));
    }
  }
  if (p.birthYear != null) conds.push(sql`${birthYearSql} = ${p.birthYear}`);
  if (p.place) conds.push(sql`${birthPlaceSql} like ${'%' + p.place + '%'}`);
  const where = conds.length ? and(...conds) : undefined;

  const items = db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname,
    marriedName: persons.marriedName,
    birthYear: birthYearSql, deathYear: deathYearSql, birthPlace: birthPlaceSql,
  }).from(persons).where(where)
    .orderBy(persons.surname, persons.givenName)
    .limit(limit).offset(offset).all();

  const total = db.select({ n: sql<number>`count(*)` }).from(persons).where(where).all()[0]?.n ?? 0;
  return { items, total };
}

export function getPersonFull(db: Db, id: string): PersonFull | null {
  const person = db.select().from(persons).where(eq(persons.id, id)).all()[0];
  if (!person) return null;

  const sourceTitles = new Map(
    db.select({ id: sources.id, title: sources.title }).from(sources).all().map(s => [s.id, s.title]),
  );
  const toCitation = (c: typeof citations.$inferSelect): CitationView => ({
    id: c.id, sourceId: c.sourceId, sourceTitle: sourceTitles.get(c.sourceId) ?? null,
    page: c.page, quality: c.quality, text: c.text,
  });

  const evts = db.select().from(events)
    .where(and(eq(events.ownerType, 'person'), eq(events.ownerId, id))).all()
    .sort((a, b) => ((a.dateYear ?? 9999) - (b.dateYear ?? 9999)) || (a.id - b.id));
  const eventCits = evts.length
    ? db.select().from(citations).where(and(eq(citations.ownerType, 'event'), inArray(citations.ownerId, evts.map(e => String(e.id))))).all()
    : [];
  const eventViews: EventView[] = evts.map(e => ({
    id: e.id, type: e.type, dateRaw: e.dateRaw, dateYear: e.dateYear,
    place: e.place, description: e.description, age: e.age,
    citations: eventCits.filter(c => c.ownerId === String(e.id)).map(toCitation),
  }));

  const personCits = db.select().from(citations)
    .where(and(eq(citations.ownerType, 'person'), eq(citations.ownerId, id))).all().map(toCitation);

  const mediaViews: MediaView[] = db.select().from(media)
    .where(and(eq(media.ownerType, 'person'), eq(media.ownerId, id))).all()
    .map(m => ({ id: m.id, title: m.title, available: m.downloadStatus === 'done' }));

  const members = (ids: string[]): FamilyMember[] => {
    // One row per person, in the order asked for: a child of two families
    // that share a parent would otherwise get that parent twice, and two
    // React children with the same key make the list drop nodes.
    ids = [...new Set(ids)];
    if (!ids.length) return [];
    const rows = db.select({
      id: persons.id, givenName: persons.givenName, surname: persons.surname,
      birthYear: birthYearSql, deathYear: deathYearSql,
    }).from(persons).where(inArray(persons.id, ids)).all();
    const byId = new Map(rows.map(r => [r.id, r]));
    return ids.map(i => byId.get(i)).filter((x): x is FamilyMember => !!x);
  };

  const childLinks = db.select().from(familyChildren).where(eq(familyChildren.childId, id)).all();
  const parentFamilies = childLinks.length
    ? db.select().from(families).where(inArray(families.id, childLinks.map(l => l.familyId))).all()
    : [];
  const parents = members(parentFamilies.flatMap(f => [f.husbandId, f.wifeId]).filter((x): x is string => !!x));
  const siblingLinks = parentFamilies.length
    ? db.select().from(familyChildren).where(inArray(familyChildren.familyId, parentFamilies.map(f => f.id))).all()
    : [];
  const siblings = members([...new Set(siblingLinks.sort((a, b) => a.seq - b.seq).map(l => l.childId))].filter(c => c !== id));

  const ownFamilies = db.select().from(families)
    .where(or(eq(families.husbandId, id), eq(families.wifeId, id))).all();
  const famIds = ownFamilies.map(f => f.id);
  const famChildLinks = famIds.length
    ? db.select().from(familyChildren).where(inArray(familyChildren.familyId, famIds)).all()
    : [];
  const famEvents = famIds.length
    ? db.select().from(events).where(and(eq(events.ownerType, 'family'), inArray(events.ownerId, famIds))).all()
    : [];
  const familyViews: FamilyView[] = ownFamilies.map(f => {
    const spouseId = f.husbandId === id ? f.wifeId : f.husbandId;
    const marr = famEvents.find(e => e.ownerId === f.id && e.type === 'MARR');
    const childIds = famChildLinks.filter(c => c.familyId === f.id).sort((a, b) => a.seq - b.seq).map(c => c.childId);
    return {
      familyId: f.id,
      spouse: spouseId ? members([spouseId])[0] ?? null : null,
      marriage: marr
        ? { id: marr.id, dateRaw: marr.dateRaw, dateYear: marr.dateYear, place: marr.place, description: marr.description }
        : null,
      children: members(childIds),
    };
  });

  return {
    person: {
      id: person.id, givenName: person.givenName, surname: person.surname,
      marriedName: person.marriedName, suffix: person.suffix, sex: person.sex, note: person.note,
    },
    events: eventViews, personCitations: personCits, media: mediaViews,
    parents, siblings, families: familyViews,
    log: buildPersonLog(db, id),
  };
}
