/**
 * Removes a child's link to one family, leaving the child and the family alone.
 *
 * Needed after merging two records of the same child that hung under different
 * parents: the merge relinks the duplicate's parent onto the survivor, so the
 * survivor briefly has both. Which of the two is right is not something a merge
 * can know — it is a matter of who could actually have borne the child — so the
 * wrong link is cut here, deliberately, one at a time.
 *
 * Refuses to leave a child with no parents at all: a link removed by mistake is
 * far harder to notice than one that was never made.
 *
 *   npx tsx scripts/detach-child.ts <tree> <childId> <familyId> "<why>"
 */
import { eq } from 'drizzle-orm';
import { openTree } from '../lib/trees';
import { familyChildren, auditLog } from '../db/schema';

const [treeId, childId, familyId, reason] = process.argv.slice(2);
if (!treeId || !childId || !familyId) {
  console.error('Användning: detach-child.ts <träd> <person> <familj> "<skäl>"');
  process.exit(1);
}

const db = openTree(treeId);

db.transaction(tx => {
  const links = tx.select().from(familyChildren).where(eq(familyChildren.childId, childId)).all();
  const target = links.find(l => l.familyId === familyId);
  if (!target) throw new Error(`${childId} är inte barn i ${familyId}`);
  if (links.length < 2) throw new Error(`${childId} har bara ${familyId} — skulle bli föräldralös, avbryter`);

  tx.delete(familyChildren).where(eq(familyChildren.id, target.id)).run();

  tx.insert(auditLog).values({
    timestamp: new Date().toISOString(),
    action: 'delete',
    entityType: 'familyChild',
    entityId: String(target.id),
    before: JSON.stringify({ ...target, reason: reason ?? null }),
    after: null,
  }).run();

  const left = links.filter(l => l.id !== target.id).map(l => l.familyId);
  console.log(`${childId}: kopplingen till ${familyId} borttagen, kvar i ${left.join(', ')}`);
});
