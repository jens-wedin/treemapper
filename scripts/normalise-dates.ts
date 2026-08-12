/**
 * Brings every date in one tree to the same shape.
 *
 * The date column was free text on the way in and free text on the way out, so
 * it collected Swedish month names, centuries written as `17xx`, ranges that
 * really meant periods, and a parish. `lib/dateCleanup.ts` decides what each
 * row needs; this only carries it out.
 *
 * Dry run by default. Read the rescues — there are only a handful and each one
 * is a judgement about someone's real record.
 *
 *   npx tsx scripts/normalise-dates.ts <tree> [--apply]
 */
import { eq } from 'drizzle-orm';
import { auditLog, events } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';
import { planDateFix, type FixReason } from '../lib/dateCleanup';
import { extractYear } from '../lib/dates';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');

const db = openTree(treeId);
const all = db.select().from(events).all();

const planned = all
  .map(e => ({ row: e, fix: planDateFix(e) }))
  .filter((p): p is { row: typeof all[number]; fix: NonNullable<ReturnType<typeof planDateFix>> } => p.fix !== null);

const byReason = new Map<FixReason, typeof planned>();
for (const p of planned) byReason.set(p.fix.reason, [...(byReason.get(p.fix.reason) ?? []), p]);

console.log(`Tree            : ${treeId}`);
console.log(`Events in total : ${all.length}`);
console.log(`Rows to change  : ${planned.length}`);
console.log(apply ? '\nAPPLYING.\n' : '\nDry run — nothing is written. Add --apply.\n');

/** Mechanical changes are summarised; judgement calls are listed one by one. */
const SUMMARISE: FixReason[] = ['residence-period', 'normalise'];

for (const [reason, rows] of byReason) {
  console.log(`${reason}  (${rows.length})`);
  const shown = SUMMARISE.includes(reason) ? rows.slice(0, 3) : rows;
  for (const { row, fix } of shown) {
    const date = `${row.dateRaw} -> ${fix.dateRaw ?? '(blank)'}`;
    const moved = fix.description !== row.description ? `   description: ${fix.description}` : '';
    console.log(`   ${row.ownerId} ${row.type.padEnd(5)} ${date}${moved}`);
  }
  if (shown.length < rows.length) console.log(`   … and ${rows.length - shown.length} more of the same`);
  console.log('');
}

if (!apply) process.exit(0);

let written = 0;
db.transaction(tx => {
  for (const { row, fix } of planned) {
    const after = {
      dateRaw: fix.dateRaw,
      // Derived, and recomputed here so it cannot fall behind the text.
      dateYear: extractYear(fix.dateRaw),
      description: fix.description,
      place: fix.place,
    };
    tx.update(events).set(after).where(eq(events.id, row.id)).run();
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'update',
      entityType: 'event',
      entityId: String(row.id),
      before: JSON.stringify(row),
      after: JSON.stringify({ ...row, ...after }),
    }).run();
    written += 1;
  }
});

const afterCount = db.select().from(events).all().length;
console.log(`Rows changed    : ${written}`);
console.log(`Events in total : ${afterCount}  (was ${all.length} — this script never adds or removes rows)`);
if (afterCount !== all.length) {
  console.error('ROW COUNT CHANGED. Investigate before trusting this database.');
  process.exit(1);
}
