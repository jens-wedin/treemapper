/**
 * Downloads the photos a GEDCOM names but only links to.
 *
 *   npm run media                        the original tree
 *   npm run media -- andersson  a tree that was imported
 *
 * Each tree keeps its photos in its own folder. Media ids are per-database
 * integers, so two trees both own a media 1 — writing them to one folder would
 * have the second tree quietly overwrite the first tree's photographs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ne, inArray } from 'drizzle-orm';
import { media } from '../db/schema';
import { DEFAULT_TREE, defaultTreeId, mediaDirFor, openTree } from '../lib/trees';
import { downloadAll, type DownloadTask } from '../lib/downloader';

const treeId = process.argv[2] ?? DEFAULT_TREE;
const db = openTree(treeId);
const mediaDir = mediaDirFor(treeId);
const fileFor = (m: { id: number; form: string | null }) => path.join(mediaDir, `${m.id}.${m.form ?? 'jpg'}`);

const pending = db.select().from(media).where(ne(media.downloadStatus, 'done')).all();
if (!pending.length) {
  console.log('Every photo has already been downloaded.');
  process.exit(0);
}
fs.mkdirSync(mediaDir, { recursive: true });
console.log(`Tree: ${treeId === DEFAULT_TREE ? defaultTreeId() : treeId} → ${mediaDir}`);
console.log(`Laddar ner ${pending.length} foton …`);

const tasks: DownloadTask[] = pending.map(m => ({
  id: m.id,
  url: m.originalUrl,
  dest: fileFor(m),
}));

const results = await downloadAll(tasks, {
  onProgress: (done, total) => {
    if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
  },
});

const okIds = results.filter(r => r.ok).map(r => r.id);
const failed = results.filter(r => !r.ok);
const now = new Date().toISOString();

for (const m of pending.filter(p => okIds.includes(p.id))) {
  db.update(media)
    .set({ downloadStatus: 'done', localPath: fileFor(m), downloadedAt: now })
    .where(inArray(media.id, [m.id]))
    .run();
}
if (failed.length) {
  db.update(media).set({ downloadStatus: 'failed' }).where(inArray(media.id, failed.map(f => f.id))).run();
}

const reportLines = [
  `# Mediarapport — ${now}`,
  '',
  `Queued: ${pending.length} · Downloaded: ${okIds.length} · Failed: ${failed.length}`,
  '',
];
if (failed.length) {
  const with403 = failed.filter(f => f.error?.includes('403')).length;
  if (with403) {
    reportLines.push(
      `**${with403} of the failures are HTTP 403 — most likely expired signed CDN links.**`,
      'Take a fresh GEDCOM export from MyHeritage and run:',
      '`npm run refresh-media -- data/<fresh-export>.ged` followed by `npm run media`.',
      '',
    );
  }
  const byId = new Map(pending.map(p => [p.id, p]));
  reportLines.push('| Media | Fel | URL |', '|---|---|---|');
  for (const f of failed) {
    reportLines.push(`| ${f.id} | ${f.error} | ${byId.get(f.id)?.originalUrl ?? ''} |`);
  }
}
const report = path.join('data', treeId === DEFAULT_TREE ? 'media-report.md' : `media-report-${treeId}.md`);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(report, reportLines.join('\n'));

console.log(`Klart: ${okIds.length} nedladdade, ${failed.length} misslyckade.`);
for (const f of failed.slice(0, 5)) console.log(`  ✗ media ${f.id}: ${f.error}`);
if (failed.length) console.log(`Rapport: ${report}`);
