import fs from 'node:fs';
import { ne, inArray } from 'drizzle-orm';
import { createDb } from '../db/client';
import { media } from '../db/schema';
import { downloadAll, type DownloadTask } from '../lib/downloader';

const db = createDb();
const pending = db.select().from(media).where(ne(media.downloadStatus, 'done')).all();
if (!pending.length) {
  console.log('Alla foton är redan nedladdade.');
  process.exit(0);
}
console.log(`Laddar ner ${pending.length} foton …`);

const tasks: DownloadTask[] = pending.map(m => ({
  id: m.id,
  url: m.originalUrl,
  dest: `media/${m.id}.${m.form ?? 'jpg'}`,
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
    .set({ downloadStatus: 'done', localPath: `media/${m.id}.${m.form ?? 'jpg'}`, downloadedAt: now })
    .where(inArray(media.id, [m.id]))
    .run();
}
if (failed.length) {
  db.update(media).set({ downloadStatus: 'failed' }).where(inArray(media.id, failed.map(f => f.id))).run();
}

const reportLines = [
  `# Mediarapport — ${now}`,
  '',
  `Totalt i kön: ${pending.length} · Nedladdade: ${okIds.length} · Misslyckade: ${failed.length}`,
  '',
];
if (failed.length) {
  const with403 = failed.filter(f => f.error?.includes('403')).length;
  if (with403) {
    reportLines.push(
      `**${with403} fel är HTTP 403 — troligen utgångna signerade CDN-länkar.**`,
      'Skaffa en färsk GEDCOM-export från MyHeritage och kör:',
      '`npm run refresh-media -- data/<färsk-export>.ged` följt av `npm run media`.',
      '',
    );
  }
  const byId = new Map(pending.map(p => [p.id, p]));
  reportLines.push('| Media | Fel | URL |', '|---|---|---|');
  for (const f of failed) {
    reportLines.push(`| ${f.id} | ${f.error} | ${byId.get(f.id)?.originalUrl ?? ''} |`);
  }
}
fs.writeFileSync('data/media-report.md', reportLines.join('\n'));

console.log(`Klart: ${okIds.length} nedladdade, ${failed.length} misslyckade.`);
for (const f of failed.slice(0, 5)) console.log(`  ✗ media ${f.id}: ${f.error}`);
if (failed.length) console.log('Rapport: data/media-report.md');
