import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sources, citations, persons, events } from '../db/schema';
import { eventLabelSv } from './eventLabels';

export interface SourceListItem {
  id: string;
  title: string | null;
  author: string | null;
  publication: string | null;
  citationCount: number;
}

export interface SourceCitationView {
  id: number;
  ownerType: 'person' | 'family' | 'event';
  ownerId: string;
  page: string | null;
  quality: number | null;
  text: string | null;
  /** Person to link to — resolved through the event for event-owned citations. */
  personId: string | null;
  label: string;
}

export interface SourceFull {
  source: { id: string; title: string | null; author: string | null; publication: string | null; note: string | null; transcription: string | null };
  citations: SourceCitationView[];
  citationTotal: number;
}

const MAX_CITATIONS = 500;

// Raw sources.id qualifier — see the drizzle-rendering gotcha in lib/queries.ts.
const citationCountSql = sql<number>`(select count(*) from citations c where c.source_id = sources.id)`;

export function listSources(db: Db, p: { q?: string; limit?: number; offset?: number } = {}): { items: SourceListItem[]; total: number } {
  const limit = Math.min(p.limit ?? 50, 200);
  const offset = p.offset ?? 0;
  const conds: (SQL | undefined)[] = [];
  if (p.q) {
    const pat = `%${p.q}%`;
    conds.push(or(like(sources.title, pat), like(sources.author, pat)));
  }
  const where = conds.length ? and(...conds) : undefined;

  const items = db.select({
    id: sources.id, title: sources.title, author: sources.author,
    publication: sources.publication, citationCount: citationCountSql,
  }).from(sources).where(where)
    .orderBy(sources.title, sources.id)
    .limit(limit).offset(offset).all();

  const total = db.select({ n: sql<number>`count(*)` }).from(sources).where(where).all()[0]?.n ?? 0;
  return { items, total };
}

export function getSourceFull(db: Db, id: string): SourceFull | null {
  const source = db.select().from(sources).where(eq(sources.id, id)).all()[0];
  if (!source) return null;

  const all = db.select().from(citations).where(eq(citations.sourceId, id)).all();
  const rows = all.slice(0, MAX_CITATIONS);

  // Resolve event-owned citations to the event's owning person.
  const eventIds = rows.filter(c => c.ownerType === 'event').map(c => Number(c.ownerId)).filter(n => Number.isInteger(n));
  const eventRows = eventIds.length
    ? db.select().from(events).where(inArray(events.id, eventIds)).all()
    : [];
  const eventById = new Map(eventRows.map(e => [e.id, e]));

  const personIds = new Set<string>();
  for (const c of rows) {
    if (c.ownerType === 'person') personIds.add(c.ownerId);
    const e = c.ownerType === 'event' ? eventById.get(Number(c.ownerId)) : undefined;
    if (e?.ownerType === 'person') personIds.add(e.ownerId);
  }
  const personRows = personIds.size
    ? db.select({ id: persons.id, givenName: persons.givenName, surname: persons.surname })
      .from(persons).where(inArray(persons.id, [...personIds])).all()
    : [];
  const personById = new Map(personRows.map(p => [p.id, p]));
  const nameOf = (pid: string) => {
    const p = personById.get(pid);
    return p ? [p.givenName, p.surname].filter(s => s.trim()).join(' ') || pid : pid;
  };

  const views: SourceCitationView[] = rows.map(c => {
    if (c.ownerType === 'person') {
      return { ...c, ownerType: 'person', personId: c.ownerId, label: nameOf(c.ownerId) };
    }
    if (c.ownerType === 'event') {
      const e = eventById.get(Number(c.ownerId));
      const personId = e?.ownerType === 'person' ? e.ownerId : null;
      const label = e
        ? `${personId ? nameOf(personId) : `Familj ${e.ownerId}`} — ${eventLabelSv(e.type)}`
        : `Händelse ${c.ownerId}`;
      return { ...c, ownerType: 'event', personId, label };
    }
    return { ...c, ownerType: 'family', personId: null, label: `Familj ${c.ownerId}` };
  });

  return {
    source: {
      id: source.id, title: source.title, author: source.author,
      publication: source.publication, note: source.note, transcription: source.transcription,
    },
    citations: views,
    citationTotal: all.length,
  };
}
