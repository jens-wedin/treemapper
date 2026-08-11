/**
 * Moves an imported source's own words out of `note` and into `transcription`.
 *
 * The mapper used to fall GEDCOM's SOUR.TEXT back into `note` when there was no
 * NOTE. That filled 478 of 520 sources with MyHeritage's own blurbs — "Geni
 * World Family Tree finns på…", an archive's description of its collection —
 * and left nowhere to write a remark of your own.
 *
 * NOTE is what the researcher says about a source; TEXT is what the source
 * says. Only rows whose note demonstrably came from a TEXT node are moved,
 * which is checked against the raw tags kept at import rather than guessed
 * from the text itself.
 *
 *   npx tsx scripts/split-source-text.ts <tree> [--apply]
 */
import { eq } from 'drizzle-orm';
import { auditLog, sources } from '../db/schema';
import { DEFAULT_TREE, openTree } from '../lib/trees';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');

const db = openTree(treeId);

/** The TEXT node's value, if this source's raw tags carry one. */
function rawText(json: string | null): string | null {
  if (!json) return null;
  let tags: unknown;
  try { tags = JSON.parse(json); } catch { return null; }
  let found: string | null = null;
  const walk = (nodes: { tag?: string; value?: string; children?: unknown[] }[]) => {
    for (const n of nodes) {
      if (n.tag === 'TEXT' && typeof n.value === 'string' && found === null) found = n.value;
      if (Array.isArray(n.children)) walk(n.children as typeof nodes);
    }
  };
  walk(Array.isArray(tags) ? (tags as { tag?: string }[]) : []);
  return found;
}

const rows = db.select().from(sources).all();
const movable = rows.filter(s => {
  if (!s.note || s.transcription) return false;
  const text = rawText(s.rawTags);
  // Identical to the TEXT that was imported → the note *is* that text.
  return text !== null && text === s.note;
});

console.log(`Tree               : ${treeId}`);
console.log(`Sources            : ${rows.length}`);
console.log(`Har en anteckning : ${rows.filter(s => s.note).length}`);
console.log(`Came from SOUR.TEXT: ${movable.length}  ← moved to the transcription`);
console.log(`Your own notes     : ${rows.filter(s => s.note).length - movable.length}  ← left alone`);

if (!apply) {
  console.log('\nExempel:');
  for (const s of movable.slice(0, 3)) {
    console.log(`   ${s.id}  ${(s.title ?? '').slice(0, 50)}`);
    console.log(`      ${(s.note ?? '').replace(/\s+/g, ' ').slice(0, 100)}`);
  }
  console.log('\nDry run. Add --apply to do it for real.');
  process.exit(0);
}

db.transaction(tx => {
  for (const s of movable) {
    const before = { ...s };
    // The raw TEXT node goes too: it lives in its own column now, and leaving
    // it in raw_tags would make the export write TEXT twice.
    const rawTags = s.rawTags
      ? JSON.stringify((JSON.parse(s.rawTags) as { tag?: string }[]).filter(n => n.tag !== 'TEXT'))
      : s.rawTags;
    tx.update(sources).set({ transcription: s.note, note: null, rawTags })
      .where(eq(sources.id, s.id)).run();
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'update',
      entityType: 'source',
      entityId: s.id,
      before: JSON.stringify(before),
      after: JSON.stringify({ ...s, transcription: s.note, note: null, rawTags }),
    }).run();
  }
});

console.log(`\nMoved ${movable.length} source texts.`);
