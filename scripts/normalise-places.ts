/**
 * Spells the country one way in every place string.
 *
 * Sweden was written nine ways — Sverige, Sweden, SWEDEN, SE, Swe, sverige,
 * SVerige, Suecia, sweden — because GEDCOM's PLAC is free text with no
 * controlled vocabulary. The canonical form is the Swedish name, because a
 * place name is data and stays as it was written in the register.
 *
 * Only the last segment is ever touched. The parish and county in front of it
 * are left exactly alone, spelling inconsistencies and all: those are a much
 * larger job and a different question.
 *
 *   npx tsx scripts/normalise-places.ts <tree> [--apply] [--no-imply]
 */
import { eq } from 'drizzle-orm';
import { auditLog, events } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';
import { countryFromPlace, countryName, impliedCountry, isSubdivisionName } from '../lib/places';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');
const imply = !process.argv.includes('--no-imply');

const db = openTree(treeId);
const all = db.select().from(events).all();

type Change = { id: number; before: string; after: string; reason: 'spelling' | 'implied' };
const changes: Change[] = [];

for (const e of all) {
  const place = e.place?.trim();
  if (!place) continue;

  // England and Scotland map to GB for the flag, but they are not other
  // spellings of Storbritannien — rewriting them would lose what was recorded.
  if (isSubdivisionName(place)) continue;

  const named = countryFromPlace(place);
  if (named) {
    const canonical = countryName(named);
    const segments = place.split(',').map(s => s.trim());
    if (!canonical || segments[segments.length - 1] === canonical) continue;
    segments[segments.length - 1] = canonical;
    changes.push({ id: e.id, before: place, after: segments.join(', '), reason: 'spelling' });
    continue;
  }

  if (!imply) continue;
  const implied = impliedCountry(place);
  if (!implied) continue;
  changes.push({
    id: e.id,
    before: place,
    after: `${place}, ${countryName(implied)}`,
    reason: 'implied',
  });
}

const byReason = (reason: Change['reason']) => changes.filter(c => c.reason === reason);

console.log(`Tree            : ${treeId}`);
console.log(`Events in total : ${all.length}`);
console.log(`Places to change: ${changes.length}`);
console.log(apply ? '\nAPPLYING.\n' : '\nDry run — nothing is written. Add --apply.\n');

console.log(`spelling  (${byReason('spelling').length})  the country renamed to its canonical form`);
const spellings = new Map<string, number>();
for (const c of byReason('spelling')) {
  const key = `${c.before.split(',').pop()!.trim()}  ->  ${c.after.split(',').pop()!.trim()}`;
  spellings.set(key, (spellings.get(key) ?? 0) + 1);
}
for (const [key, n] of [...spellings].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}x  ${key}`);
}

console.log('');
console.log(`implied   (${byReason('implied').length})  country appended where a county code proves it`);
console.log('   Each of these asserts something the record did not literally say.');
for (const c of byReason('implied').slice(0, 8)) console.log(`   ${c.before}  ->  ${c.after}`);
if (byReason('implied').length > 8) console.log(`   … and ${byReason('implied').length - 8} more`);

if (!apply) process.exit(0);

const rows = new Map(all.map(e => [e.id, e]));
db.transaction(tx => {
  for (const c of changes) {
    const before = rows.get(c.id)!;
    tx.update(events).set({ place: c.after }).where(eq(events.id, c.id)).run();
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'update',
      entityType: 'event',
      entityId: String(c.id),
      before: JSON.stringify(before),
      after: JSON.stringify({ ...before, place: c.after }),
    }).run();
  }
});

const afterCount = db.select().from(events).all().length;
console.log(`\nRows changed    : ${changes.length}`);
console.log(`Events in total : ${afterCount}  (was ${all.length} — this script never adds or removes rows)`);
if (afterCount !== all.length) {
  console.error('ROW COUNT CHANGED. Investigate before trusting this database.');
  process.exit(1);
}
