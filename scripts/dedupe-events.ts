/**
 * Removes event rows that repeat another row exactly.
 *
 * Merging two records of one person used to copy their shared facts across
 * without noticing they were the same, so people ended up born twice on the
 * same day. The merge engine no longer does that; these are the rows left from
 * before, and they show as repeated lines wherever events are listed.
 *
 * "Exactly" means every column but the id — same owner, type, date, year,
 * place, description, age and raw GEDCOM tags. Two births with *different*
 * dates are two sources disagreeing and are left alone: that is a question for
 * the person doing the research, not for a script.
 *
 * The lowest id stays, so the row that has been there longest is the one that
 * survives, and anything citing it keeps pointing at the same place.
 *
 *   npx tsx scripts/dedupe-events.ts <tree> [--apply]
 */
import { and, eq } from 'drizzle-orm';
import { auditLog, citations, events } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');

const db = openTree(treeId);
const all = db.select().from(events).all();

/** Every field that carries meaning. Anything left out here silently merges rows that differ. */
const keyOf = (e: typeof all[number]) => JSON.stringify([
  e.ownerType, e.ownerId, e.type, e.dateRaw, e.dateYear, e.place, e.description, e.age, e.rawTags,
]);

const groups = new Map<string, typeof all>();
for (const e of all) {
  const g = groups.get(keyOf(e)) ?? [];
  g.push(e);
  groups.set(keyOf(e), g);
}

const dupes = [...groups.values()].filter(g => g.length > 1)
  .map(g => [...g].sort((a, b) => a.id - b.id));

const redundant = dupes.flatMap(g => g.slice(1));
console.log(`Träd            : ${treeId}`);
console.log(`Händelser totalt: ${all.length}`);
console.log(`Identiska grupper: ${dupes.length}`);
console.log(`Rader att ta bort: ${redundant.length}  (lägsta id:t i varje grupp behålls)`);

const byType = new Map<string, number>();
for (const e of redundant) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
console.log('\nPer typ:');
for (const [type, n] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`   ${type.padEnd(6)} ${n}`);

console.log('\nExempel:');
for (const g of dupes.slice(0, 4)) {
  const [keep, ...drop] = g;
  console.log(`   ${keep!.ownerId} ${keep!.type} ${keep!.dateRaw ?? '—'} ${keep!.place ?? ''}`.slice(0, 90));
  console.log(`      behåller ${keep!.id}, tar bort ${drop.map(d => d.id).join(', ')}`);
}

if (!apply) {
  console.log('\nTorrkörning. Lägg till --apply för att göra det på riktigt.');
  process.exit(0);
}

let movedCitations = 0;

db.transaction(tx => {
  for (const group of dupes) {
    const [keep, ...drop] = group;
    for (const row of drop) {
      // A citation hung on the copy is evidence about the fact, not about the
      // row — it moves to the row that stays rather than going with the one
      // being removed. (Photos cannot attach to an event: `media.ownerType` is
      // person or family only.)
      const from = String(row.id);
      const to = String(keep!.id);
      movedCitations += tx.update(citations).set({ ownerId: to })
        .where(and(eq(citations.ownerType, 'event'), eq(citations.ownerId, from))).run().changes;

      tx.delete(events).where(eq(events.id, row.id)).run();
      tx.insert(auditLog).values({
        timestamp: new Date().toISOString(),
        action: 'delete',
        entityType: 'event',
        entityId: from,
        before: JSON.stringify({ ...row, duplicateOf: keep!.id }),
        after: null,
      }).run();
    }
  }
});

console.log(`\nTog bort ${redundant.length} rader.`);
if (movedCitations) console.log(`Flyttade ${movedCitations} källhänvisningar till raden som blev kvar.`);
