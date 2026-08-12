/**
 * Deletes the residence events whose only place is `Census`.
 *
 * `Census` is not a place — it is what MyHeritage put in the place column when
 * the fact came from a census enumeration. The 28 events in `wedin.db` carry a
 * date span and nothing else: no place, no description, no age, no citation.
 * "Resided somewhere between 1876 and 1885" is not a fact anybody will use, and
 * it was cluttering the Countries queue and the person pages.
 *
 * Every deleted row writes its full before-image to `audit_log`, which is what
 * makes this reversible. Nothing else is touched.
 *
 *   npx tsx scripts/drop-census-events.ts <tree> [--apply]
 */
import { eq, inArray } from 'drizzle-orm';
import { auditLog, citations, events, persons } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';

/** Exactly this, case-insensitively. Not "contains census" — see below. */
const PLACE = 'census';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');

const db = openTree(treeId);
const all = db.select().from(events).all();

/**
 * Matched on the whole place, never on a substring. A real place could contain
 * the word — an English street or building name — and a substring rule would
 * take it with no way to notice.
 */
const doomed = all.filter(e => e.place?.trim().toLowerCase() === PLACE);

const named = new Map(
  db.select({ id: persons.id, given: persons.givenName, surname: persons.surname })
    .from(persons).all()
    .map(p => [p.id, [p.given, p.surname].filter(Boolean).join(' ').trim()]),
);

console.log(`Tree            : ${treeId}`);
console.log(`Events in total : ${all.length}`);
console.log(`To delete       : ${doomed.length}`);
console.log(apply ? '\nAPPLYING.\n' : '\nDry run — nothing is written. Add --apply.\n');

// Anything a deleted event carries beyond its date is a reason to stop and
// look: it would go with the event and is not what was asked for.
const carrying = doomed.filter(e => e.description || e.age);
const cited = doomed.length
  ? db.select().from(citations)
      .where(inArray(citations.ownerId, doomed.map(e => String(e.id)))).all()
      .filter(c => c.ownerType === 'event')
  : [];

for (const e of doomed) {
  console.log(`  #${e.id}  ${e.type}  ${e.dateRaw ?? '(no date)'}  — ${named.get(e.ownerId) ?? e.ownerId} (${e.ownerId})`);
}

if (carrying.length || cited.length) {
  console.error(`\nSTOP. ${carrying.length} carry a description or age and ${cited.length} have citations.`);
  console.error('Deleting them would take that with them. Investigate before applying.');
  process.exit(1);
}
console.log('\nNone carries a description, an age or a citation. Only the date span is lost.');

if (!apply) process.exit(0);

db.transaction(tx => {
  for (const e of doomed) {
    tx.delete(events).where(eq(events.id, e.id)).run();
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'delete',
      entityType: 'event',
      entityId: String(e.id),
      before: JSON.stringify(e),
      after: null,
    }).run();
  }
});

const afterCount = db.select().from(events).all().length;
console.log(`\nDeleted         : ${doomed.length}`);
console.log(`Events in total : ${afterCount}  (was ${all.length})`);
if (afterCount !== all.length - doomed.length) {
  console.error('ROW COUNT IS NOT WHAT IT SHOULD BE. Investigate before trusting this database.');
  process.exit(1);
}
console.log('Every deletion is in audit_log with its full before-image.');
