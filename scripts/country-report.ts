/**
 * What the country cascade would propose, and on what evidence.
 *
 * Read-only. It writes nothing and takes no `--apply`: approving happens on the
 * review page, one group at a time, because these are assertions about where a
 * family lived and a bulk switch would defeat the point.
 *
 *   npx tsx scripts/country-report.ts <tree>
 */
import { events } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';
import { countryFromPlace } from '../lib/places';
import { countryProposals, placeOwners } from '../lib/countryProposals';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const db = openTree(treeId);

const all = db.select().from(events).all();
const withPlace = all.filter(e => e.place?.trim());
const named = withPlace.filter(e => countryFromPlace(e.place));

const { stated, learned, quarantined, unanswered } = countryProposals(db);
const owners = placeOwners(db);

const sum = (rows: number[]) => rows.reduce((a, b) => a + b, 0);
const statedRows = sum(stated.map(s => s.rows));
const learnedRows = sum(learned.map(g => g.rows));
const quarantinedRows = sum(quarantined.map(q => q.rows));

console.log(`Tree              : ${treeId}`);
console.log(`Events            : ${all.length}`);
console.log(`Carrying a place  : ${withPlace.length}`);
console.log(`Already readable  : ${named.length}`);
console.log('');
console.log(`stated      ${String(stated.length).padStart(5)} places  ${String(statedRows).padStart(5)} rows   the record says it, unreadably`);
console.log(`learned     ${String(sum(learned.map(g => g.places))).padStart(5)} places  ${String(learnedRows).padStart(5)} rows   in ${learned.length} groups`);
console.log(`quarantined ${String(quarantined.length).padStart(5)} places  ${String(quarantinedRows).padStart(5)} rows   edit distance only — read every one`);
console.log(`unanswered  ${String(unanswered).padStart(5)} places                 left alone`);

console.log(`\n--- stated: already written, in a place nothing could read (${stated.length}) ---`);
for (const s of stated) {
  console.log(`  ${String(s.rows).padStart(3)}x  ${s.place}`);
  console.log(`        -> ${s.after}`);
}

console.log(`\n--- learned: grouped by evidence (${learned.length} groups) ---`);
for (const g of learned) {
  const rival = g.rival ? `, over ${g.rival.code} x${g.rival.weight}` : '';
  console.log(
    `  ${String(g.rows).padStart(4)} rows / ${String(g.places).padStart(3)} places  ` +
    `"${g.by}" -> ${g.code}  (${g.tier}, taught ${g.weight}${rival})`,
  );
  for (const item of g.items.slice(0, 3)) {
    const who = item.owners.map(o => o.name).join(', ');
    console.log(`        ${item.place}${who ? `   — ${who}` : ''}`);
  }
}

console.log(`\n--- quarantined: every edit-distance match, with what it matched (${quarantined.length}) ---`);
for (const q of quarantined) {
  console.log(`  ${String(q.rows).padStart(3)}x  ${q.place}`);
  console.log(`        -> ${q.code}   [${q.matched} ~ ${q.by}, taught ${q.weight}]`);
}

// What is left once the queue is empty: places nothing could answer, and the
// ones that were looked at and turned down. Both need a person, so both are
// listed with somebody to go and ask.
const silent = withPlace.filter(e => !countryFromPlace(e.place));
if (silent.length) {
  const counts = new Map<string, number>();
  for (const e of silent) counts.set(e.place!.trim(), (counts.get(e.place!.trim()) ?? 0) + 1);
  console.log(`\n--- still without a country (${counts.size} places, ${silent.length} rows) ---`);
  for (const [place, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const who = owners.get(place)?.slice(0, 3).map(o => `${o.name} /person/${o.id}`).join('; ') ?? '';
    console.log(`  ${String(n).padStart(3)}x  ${place}`);
    if (who) console.log(`        ${who}`);
  }
}

console.log(`\nNothing was written. Approve on the review page: /${treeId}/countries`);
