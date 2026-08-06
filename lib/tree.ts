import { eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren } from '../db/schema';

export interface TreePerson {
  id: string;
  givenName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  sex: 'M' | 'F' | 'U';
}
export interface AncestorNode { person: TreePerson; parents: AncestorNode[] }
export interface DescendantNode { person: TreePerson; children: DescendantNode[] }
export interface TreeData { focus: TreePerson; ancestors: AncestorNode; descendants: DescendantNode }

// Raw persons.id qualifier — see the drizzle-rendering gotcha in lib/queries.ts.
const birthYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'BIRT')`;
const deathYearSql = sql<number | null>`(select min(e.date_year) from events e where e.owner_id = persons.id and e.owner_type = 'person' and e.type = 'DEAT')`;

function fetchPersons(db: Db, ids: string[]): Map<string, TreePerson> {
  if (!ids.length) return new Map();
  const rows = db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname,
    birthYear: birthYearSql, deathYear: deathYearSql, sex: persons.sex,
  }).from(persons).where(inArray(persons.id, ids)).all();
  return new Map(rows.map(r => [r.id, r]));
}

function parentIdsOf(db: Db, id: string): string[] {
  const links = db.select().from(familyChildren).where(eq(familyChildren.childId, id)).all();
  if (!links.length) return [];
  const fams = db.select().from(families).where(inArray(families.id, links.map(l => l.familyId))).all();
  return fams.flatMap(f => [f.husbandId, f.wifeId]).filter((x): x is string => !!x);
}

function childIdsOf(db: Db, id: string): string[] {
  const fams = db.select().from(families)
    .where(or(eq(families.husbandId, id), eq(families.wifeId, id))).all()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!fams.length) return [];
  const links = db.select().from(familyChildren).where(inArray(familyChildren.familyId, fams.map(f => f.id))).all();
  return fams.flatMap(f => links.filter(l => l.familyId === f.id).sort((a, b) => a.seq - b.seq).map(l => l.childId));
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
    if (depth <= 0) return { person, parents: [] };
    const ids = parentIdsOf(db, person.id).filter(p => !pathIds.has(p));
    const byId = fetchPersons(db, ids);
    return {
      person,
      parents: ids.map(pid => byId.get(pid)).filter((p): p is TreePerson => !!p)
        .map(p => ancestors(p, depth - 1, new Set([...pathIds, person.id]))),
    };
  };
  const descendants = (person: TreePerson, depth: number, pathIds: Set<string>): DescendantNode => {
    if (depth <= 0) return { person, children: [] };
    const ids = childIdsOf(db, person.id).filter(c => !pathIds.has(c));
    const byId = fetchPersons(db, ids);
    return {
      person,
      children: ids.map(cid => byId.get(cid)).filter((c): c is TreePerson => !!c)
        .map(c => descendants(c, depth - 1, new Set([...pathIds, person.id]))),
    };
  };

  return {
    focus,
    ancestors: ancestors(focus, up, new Set([id])),
    descendants: descendants(focus, down, new Set([id])),
  };
}
