/**
 * What the date parser makes of the dates that are actually there.
 *
 * Read-only. Every genuine bug in this project was found by running against the
 * real database rather than by a failing test, and a parser is exactly the kind
 * of thing that passes 49 fixtures and then meets `arbrå`.
 *
 *   npx tsx scripts/date-report.ts [tree]
 */
import { events } from '../db/schema';
import { listTrees, openTree } from '../lib/trees';
import { parseGedcomDate, toGedcom } from '../lib/gedcomDate';

const only = process.argv[2];
const trees = listTrees().filter(t => !only || t.id === only);

for (const tree of trees) {
  const db = openTree(tree.id);
  const dated = db.select().from(events).all().filter(e => e.dateRaw?.trim());

  const unreadable: { raw: string; type: string }[] = [];
  const rewritten: { raw: string; to: string }[] = [];
  let unchanged = 0;

  for (const e of dated) {
    const parsed = parseGedcomDate(e.dateRaw);
    if (!parsed) { unreadable.push({ raw: e.dateRaw!, type: e.type }); continue; }
    const canonical = toGedcom(parsed);
    if (canonical === e.dateRaw!.trim()) unchanged += 1;
    else rewritten.push({ raw: e.dateRaw!, to: canonical });

    // The round trip has to hold on real data, not only on the twelve in the test.
    const again = parseGedcomDate(canonical);
    if (JSON.stringify(again) !== JSON.stringify(parsed)) {
      console.log(`  ROUND TRIP BROKEN: "${e.dateRaw}" -> "${canonical}" -> ${JSON.stringify(again)}`);
    }
  }

  console.log(`\n=== ${tree.id} ===`);
  console.log(`dated events   : ${dated.length}`);
  console.log(`already canonical: ${unchanged}`);
  console.log(`would be rewritten: ${rewritten.length}`);
  console.log(`cannot be read : ${unreadable.length}`);

  if (rewritten.length) {
    const shapes = new Map<string, number>();
    for (const r of rewritten) shapes.set(`${r.raw}  ->  ${r.to}`, (shapes.get(`${r.raw}  ->  ${r.to}`) ?? 0) + 1);
    console.log('\nrewrites, most common first:');
    for (const [shape, n] of [...shapes].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`   ${String(n).padStart(4)}x  ${shape}`);
    }
  }

  if (unreadable.length) {
    console.log('\ncannot be read:');
    const shapes = new Map<string, number>();
    for (const u of unreadable) shapes.set(`${u.type} "${u.raw}"`, (shapes.get(`${u.type} "${u.raw}"`) ?? 0) + 1);
    for (const [shape, n] of [...shapes].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(4)}x  ${shape}`);
    }
  }
}
