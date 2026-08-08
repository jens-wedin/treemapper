import type { Db } from '../db/client';
import { persons, families, familyChildren, events, citations } from '../db/schema';

/**
 * Finding the copies of a branch that was imported more than once.
 *
 * The Konsekvens detector already flags likely duplicates one pair at a time,
 * on name and birth *year*. This is the other half of the problem: a whole
 * branch duplicated wholesale, where the useful signals are the exact birth
 * date and who someone is married to, and where the answer is a cluster of
 * three or four records rather than a pair.
 */

export interface Cluster {
  /** Best-sourced first — the caller merges the rest into this one. */
  ids: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

interface Snapshot {
  people: Map<string, { id: string; givenName: string; surname: string }>;
  birth: Map<string, string>;
  fams: { id: string; husbandId: string | null; wifeId: string | null }[];
  links: { familyId: string; childId: string }[];
  citeCount: Map<string, number>;
  eventCount: Map<string, number>;
}

function read(db: Db): Snapshot {
  const birth = new Map<string, string>();
  const eventCount = new Map<string, number>();
  for (const e of db.select().from(events).all()) {
    if (e.ownerType !== 'person') continue;
    eventCount.set(e.ownerId, (eventCount.get(e.ownerId) ?? 0) + 1);
    if (e.type === 'BIRT' && e.dateRaw && !birth.has(e.ownerId)) birth.set(e.ownerId, e.dateRaw);
  }
  const citeCount = new Map<string, number>();
  for (const c of db.select().from(citations).all()) {
    if (c.ownerType === 'person') citeCount.set(c.ownerId, (citeCount.get(c.ownerId) ?? 0) + 1);
  }
  return {
    people: new Map(db.select().from(persons).all().map(p => [p.id, p])),
    birth,
    fams: db.select().from(families).all(),
    links: db.select().from(familyChildren).all(),
    citeCount,
    eventCount,
  };
}

/** Everyone reachable from `seed` through marriages and children. */
export function branchMembers(db: Db, seed: string[]): Set<string> {
  const { fams, links } = read(db);
  const scope = new Set(seed);
  const queue = [...seed];
  while (queue.length) {
    const id = queue.shift()!;
    for (const f of fams.filter(f => f.husbandId === id || f.wifeId === id)) {
      for (const partner of [f.husbandId, f.wifeId]) {
        if (partner && !scope.has(partner)) { scope.add(partner); queue.push(partner); }
      }
      for (const l of links.filter(l => l.familyId === f.id)) {
        if (!scope.has(l.childId)) { scope.add(l.childId); queue.push(l.childId); }
      }
    }
  }
  return scope;
}

/**
 * Which records inside `scope` are the same person.
 *
 * Two signals, both requiring an exact birth date:
 *  - the same name on the same day;
 *  - the same day and the same partner, which catches a married name written
 *    in a different order ("Brita Jonsdotter Forss" / "Brita Fors Jonsdotter").
 *
 * Twins are the trap: siblings share a surname and a birthday, so the given
 * name is part of the key, and any cluster holding two children of the *same*
 * family is dropped rather than guessed at.
 */
export function duplicateClusters(db: Db, scope: Set<string>): Cluster[] {
  const snap = read(db);
  const { people, birth, fams, links } = snap;

  const familyOf = new Map<string, string>();
  for (const l of links) familyOf.set(l.childId, l.familyId);
  const partnersOf = (id: string) => fams
    .filter(f => f.husbandId === id || f.wifeId === id)
    .map(f => (f.husbandId === id ? f.wifeId : f.husbandId))
    .filter((x): x is string => !!x)
    .sort()
    .join(',');

  const buckets = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    const list = buckets.get(key) ?? [];
    list.push(id);
    buckets.set(key, list);
  };

  for (const id of scope) {
    const person = people.get(id);
    const born = birth.get(id);
    if (!person || !born) continue;
    add(norm(person.surname)
      ? `name:${norm(person.givenName)}|${norm(person.surname)}|${born}`
      : `unnamed:${born}`, id);
    const partners = partnersOf(id);
    if (partners) add(`partner:${born}|${partners}`, id);
  }

  const weight = (id: string) => {
    const own = fams.filter(f => f.husbandId === id || f.wifeId === id).map(f => f.id);
    return (snap.eventCount.get(id) ?? 0)
      + (snap.citeCount.get(id) ?? 0) * 2
      + links.filter(l => own.includes(l.familyId)).length * 3
      + (links.some(l => l.childId === id) ? 5 : 0);
  };

  const candidates: string[][] = [];
  for (const ids of buckets.values()) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    // two children of one family born the same day are twins, not copies
    const perFamily = new Map<string, number>();
    for (const id of unique) {
      const fam = familyOf.get(id) ?? '';
      perFamily.set(fam, (perFamily.get(fam) ?? 0) + 1);
    }
    if ([...perFamily.entries()].some(([fam, n]) => fam && n > 1)) continue;
    candidates.push(unique);
  }

  // one person can match on both keys; fold overlapping candidates together so
  // nobody is merged twice
  const clusters: string[][] = [];
  for (const group of candidates) {
    const existing = clusters.find(c => c.some(id => group.includes(id)));
    if (existing) for (const id of group) { if (!existing.includes(id)) existing.push(id); }
    else clusters.push([...group]);
  }

  return clusters.map(ids => ({
    ids: ids.sort((a, b) => weight(b) - weight(a) || a.localeCompare(b)),
  }));
}
