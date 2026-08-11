/**
 * Moves a child from one family to another.
 *
 * The counterpart to detach-child: when a duplicated branch is folded away,
 * a child who exists in only one of the two copies would be left standing
 * alone under parents the rest of their siblings no longer have. Deleting them
 * would be worse — they are the only record of that person — so they are moved
 * across to the family their siblings ended up in.
 *
 *   npx tsx scripts/move-child.ts <tree> <childId> <fromFamily> <toFamily> "<why>"
 */
import { and, eq } from 'drizzle-orm';
import { openTree } from '../lib/trees';
import { families, familyChildren, auditLog } from '../db/schema';

const [treeId, childId, fromId, toId, reason] = process.argv.slice(2);
if (!treeId || !childId || !fromId || !toId) {
  console.error('Usage: move-child.ts <tree> <person> <from-family> <to-family> "<reason>"');
  process.exit(1);
}

const db = openTree(treeId);

db.transaction(tx => {
  if (!tx.select().from(families).where(eq(families.id, toId)).all()[0]) {
    throw new Error(`${toId} finns inte`);
  }
  const link = tx.select().from(familyChildren)
    .where(and(eq(familyChildren.childId, childId), eq(familyChildren.familyId, fromId))).all()[0];
  if (!link) throw new Error(`${childId} is not a child in ${fromId}`);

  const already = tx.select().from(familyChildren)
    .where(and(eq(familyChildren.childId, childId), eq(familyChildren.familyId, toId))).all()[0];
  if (already) throw new Error(`${childId} is already in ${toId}`);

  const seq = tx.select().from(familyChildren).where(eq(familyChildren.familyId, toId)).all().length;
  tx.update(familyChildren).set({ familyId: toId, seq })
    .where(eq(familyChildren.id, link.id)).run();

  tx.insert(auditLog).values({
    timestamp: new Date().toISOString(),
    action: 'update',
    entityType: 'familyChild',
    entityId: String(link.id),
    before: JSON.stringify(link),
    after: JSON.stringify({ ...link, familyId: toId, seq, reason: reason ?? null }),
  }).run();

  console.log(`${childId}: moved from ${fromId} to ${toId}`);
});
