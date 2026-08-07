import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { persons, families, familyChildren } from '../../db/schema';

/**
 * Everyone in a person's own ancestry and own descent — "the bowtie".
 *
 * Deliberately not "everyone connected": walking up and down repeatedly
 * spreads through cousins and in-laws until it covers 89% of this database,
 * which would make a scoped page identical to the unscoped one.
 *
 * The walk is breadth-first over links loaded once. The recursive-CTE version
 * of the same query took 4.5 seconds; this takes about 8 ms to load and no
 * measurable time to walk.
 */
export function relativesOf(db: Db, personId: string): Set<string> | null {
  const exists = db.select({ id: persons.id }).from(persons).where(eq(persons.id, personId)).get();
  if (!exists) return null;

  const links = db.select({
    childId: familyChildren.childId,
    husbandId: families.husbandId,
    wifeId: families.wifeId,
  }).from(familyChildren).innerJoin(families, eq(families.id, familyChildren.familyId)).all();

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const link of links) {
    const parents = [link.husbandId, link.wifeId].filter((p): p is string => !!p);
    parentsOf.set(link.childId, [...(parentsOf.get(link.childId) ?? []), ...parents]);
    for (const parent of parents) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), link.childId]);
    }
  }

  // `into` is what stops a self-ancestry cycle from looping forever.
  const walk = (edges: Map<string, string[]>, into: Set<string>) => {
    const queue = [personId];
    while (queue.length) {
      for (const next of edges.get(queue.pop()!) ?? []) {
        if (into.has(next)) continue;
        into.add(next);
        queue.push(next);
      }
    }
  };

  const found = new Set<string>([personId]);
  walk(parentsOf, found);
  walk(childrenOf, found);
  return found;
}
