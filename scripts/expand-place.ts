/**
 * Writes out an abbreviated place in full.
 *
 * The register is full of them — `Th.`, `Bjr.`, `Ha.`, `Lax.`, `Trå.`,
 * `Svall.` — and no rule can expand one safely, because the expansion lives in
 * the head of whoever kept the book. So this takes both halves as arguments and
 * asserts nothing: you supply the meaning, it does the bookkeeping.
 *
 * Matches the whole place and never a substring: `Ha.` inside a longer place is
 * somebody else's abbreviation, and a substring rule would rewrite it unseen.
 *
 *   npx tsx scripts/expand-place.ts <tree> "Th." "Torsö, Skaraborgs, Västergötland, Sverige" [--apply]
 */
import { eq } from 'drizzle-orm';
import { auditLog, events, persons } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';
import { countryFromPlace } from '../lib/places';

const [, , treeArg, fromArg, toArg] = process.argv;
const apply = process.argv.includes('--apply');

if (!fromArg || !toArg) {
  console.error('Usage: expand-place.ts <tree> "<abbreviation>" "<full place>" [--apply]');
  process.exit(1);
}

const treeId = treeArg ?? DEFAULT_TREE;
const from = fromArg.trim();
const to = toArg.trim();

const db = openTree(treeId);
const all = db.select().from(events).all();
const matching = all.filter(e => e.place?.trim() === from);

const named = new Map(
  db.select({ id: persons.id, given: persons.givenName, surname: persons.surname })
    .from(persons).all()
    .map(p => [p.id, [p.given, p.surname].filter(Boolean).join(' ').trim()]),
);

console.log(`Tree            : ${treeId}`);
console.log(`Expanding       : "${from}"  ->  "${to}"`);
console.log(`Events matching : ${matching.length}`);
console.log(apply ? '\nAPPLYING.\n' : '\nDry run — nothing is written. Add --apply.\n');

if (!matching.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

// A place that names no country would leave these rows in the Countries queue,
// which is almost never what is wanted when writing a place out in full.
if (!countryFromPlace(to)) {
  console.warn(`Note: "${to}" names no country, so these will still show as country-less.\n`);
}

for (const e of matching) {
  console.log(`  #${e.id}  ${e.type}  ${e.dateRaw ?? '(no date)'}  — ${named.get(e.ownerId) ?? e.ownerId} (${e.ownerId})`);
}

if (!apply) process.exit(0);

db.transaction(tx => {
  for (const e of matching) {
    tx.update(events).set({ place: to }).where(eq(events.id, e.id)).run();
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'update',
      entityType: 'event',
      entityId: String(e.id),
      before: JSON.stringify(e),
      after: JSON.stringify({ ...e, place: to }),
    }).run();
  }
});

const afterCount = db.select().from(events).all().length;
console.log(`\nRows changed    : ${matching.length}`);
console.log(`Events in total : ${afterCount}  (was ${all.length} — this script never adds or removes rows)`);
if (afterCount !== all.length) {
  console.error('ROW COUNT CHANGED. Investigate before trusting this database.');
  process.exit(1);
}
console.log('Every change is in audit_log with its before-image.');
