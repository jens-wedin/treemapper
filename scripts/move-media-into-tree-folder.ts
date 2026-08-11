/**
 * Moves a tree's photos into the folder named after that tree.
 *
 * The original tree kept its photos loose in `media/` while imported trees got
 * subfolders. This puts every tree on the same footing — `media/wedin/`,
 * `media/andersson/` — so a media id can never mean two files.
 *
 * Renames rather than copies: the same filesystem, so each file moves as one
 * operation and 400 MB of irreplaceable photographs is never duplicated,
 * half-written, or briefly absent.
 *
 * Files with no row in the database are moved too. A removed photo deliberately
 * leaves its file behind — it may be the only copy of a face nobody living
 * remembers — and leaving those behind here would quietly break that promise.
 *
 *   npx tsx scripts/move-media-into-tree-folder.ts <tree> [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { media } from '../db/schema';
import { DEFAULT_TREE, mediaDirFor, openTree } from '../lib/trees';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const apply = process.argv.includes('--apply');

const db = openTree(treeId);
const target = mediaDirFor(treeId);
const root = path.dirname(target);

if (path.resolve(target) === path.resolve(root)) {
  throw new Error(`${treeId} already points at the media root — nothing to move`);
}

const rows = db.select().from(media).all();
const wanted = new Map<string, typeof rows[number]>();
for (const row of rows) {
  if (!row.localPath) continue;
  wanted.set(path.basename(row.localPath), row);
}

// everything sitting loose in the root, directories left alone
const loose = fs.existsSync(root)
  ? fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)
  : [];

const orphans = loose.filter(name => !wanted.has(name));
const missing = [...wanted.keys()].filter(name => !loose.includes(name) && !fs.existsSync(path.join(target, name)));

console.log(`Tree            : ${treeId}`);
console.log(`From            : ${root}/`);
console.log(`Till            : ${target}/`);
console.log(`Rader i databasen: ${rows.length}`);
console.log(`Filer att flytta : ${loose.length}  (varav ${orphans.length} utan rad — borttagna foton vars fil sparats)`);
if (missing.length) {
  console.log(`\nMISSING ON DISK (${missing.length}) — not moved, rows left untouched:`);
  for (const m of missing.slice(0, 10)) console.log(`   ${m}`);
}

if (!apply) {
  console.log('\nDry run. Add --apply to do it for real.');
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });

let moved = 0;
for (const name of loose) {
  const from = path.join(root, name);
  const to = path.join(target, name);
  if (fs.existsSync(to)) throw new Error(`${to} already exists — stopping before anything is overwritten`);
  fs.renameSync(from, to);
  moved++;
}

// The stored path is rewritten to match. Serving only ever reads the basename,
// but the GEDCOM export writes this string as its FILE line, so a stale
// directory here would export links to a folder that no longer exists.
let rewritten = 0;
db.transaction(tx => {
  for (const row of rows) {
    if (!row.localPath) continue;
    const next = path.join(target, path.basename(row.localPath));
    if (next === row.localPath) continue;
    const patch: { localPath: string; originalUrl?: string } = { localPath: next };
    // An uploaded photo has no remote source: its originalUrl is the file
    // itself, and has to travel with it.
    if (row.originalUrl === row.localPath) patch.originalUrl = next;
    tx.update(media).set(patch).where(eq(media.id, row.id)).run();
    rewritten++;
  }
});

console.log(`\nFlyttade ${moved} filer, skrev om ${rewritten} rader.`);
