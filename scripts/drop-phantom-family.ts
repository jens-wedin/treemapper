/**
 * Removes a family that a duplicate import left behind.
 *
 * When the same branch is imported twice, one copy of a couple can come back
 * with only one partner recorded. Merging the two mothers then leaves two
 * families for the same woman — one complete, one holding just her and a child
 * who already sits in the other. The merge engine will not fold those together
 * on its own, and deliberately so: a missing partner is not evidence that two
 * sets of children are one union.
 *
 * So it is done here, once, by hand, and only when the family being removed
 * holds nothing that is not already somewhere else.
 *
 *   npx tsx scripts/drop-phantom-family.ts <tree> <victim> <keeper>
 */
import { eq } from 'drizzle-orm';
import { openTree } from '../lib/trees';
import { families, familyChildren, events, citations, media, auditLog } from '../db/schema';

const [treeId, victimId, keeperId] = process.argv.slice(2);
if (!treeId || !victimId || !keeperId) {
  console.error('Usage: drop-phantom-family.ts <tree> <family-to-remove> <family-to-keep>');
  process.exit(1);
}

const db = openTree(treeId);

db.transaction(tx => {
  const family = tx.select().from(families).where(eq(families.id, victimId)).all()[0];
  if (!family) throw new Error(`${victimId} finns inte`);
  const links = tx.select().from(familyChildren).where(eq(familyChildren.familyId, victimId)).all();

  // Nothing of its own may be lost: a marriage, a source or a photo recorded
  // against this family exists nowhere else.
  const own = [
    ...tx.select().from(events).where(eq(events.ownerId, victimId)).all()
      .filter(e => e.ownerType === 'family'),
    ...tx.select().from(citations).where(eq(citations.ownerId, victimId)).all()
      .filter(c => c.ownerType === 'family'),
    ...tx.select().from(media).where(eq(media.ownerId, victimId)).all()
      .filter(m => m.ownerType === 'family'),
  ];
  if (own.length) throw new Error(`${victimId} har ${own.length} egna poster — avbryter`);

  // and every child must already be in the family that stays
  const keeperKids = new Set(tx.select().from(familyChildren)
    .where(eq(familyChildren.familyId, keeperId)).all().map(l => l.childId));
  for (const link of links) {
    if (!keeperKids.has(link.childId)) {
      throw new Error(`${link.childId} finns bara i ${victimId}, inte i ${keeperId} — avbryter`);
    }
  }

  for (const link of links) tx.delete(familyChildren).where(eq(familyChildren.id, link.id)).run();
  tx.delete(families).where(eq(families.id, victimId)).run();

  tx.insert(auditLog).values({
    timestamp: new Date().toISOString(),
    action: 'delete',
    entityType: 'family',
    entityId: victimId,
    before: JSON.stringify({ family, children: links }),
    after: null,
  }).run();

  console.log(`${victimId} borttagen: ${links.length} barnkoppling(ar), alla fanns redan i ${keeperId}`);
});
