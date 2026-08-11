import fs from 'node:fs';
import { eq, ne } from 'drizzle-orm';
import { parseGedcom } from './gedcom/parser';
import { mapGedcom } from './gedcom/mapper';
import { createDb } from '../db/client';
import { media } from '../db/schema';

export interface RefreshResult {
  matched: number;
  unmatched: { id: number; reason: string }[];
  total: number;
}

function photoRinOf(rawTags: string | null | undefined): string | null {
  if (!rawTags) return null;
  try {
    const tags = JSON.parse(rawTags) as { tag: string; value?: string }[];
    return tags.find(t => t.tag === '_PHOTO_RIN')?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Re-arms media rows whose signed CDN URLs have died, using a fresh MyHeritage
 * export. Rows with download_status 'done' are never touched. Matching order:
 * _PHOTO_RIN (stable MyHeritage id, kept in raw_tags) → owner + filesize →
 * owner + title. Each fresh media item can be claimed at most once.
 */
export function refreshMediaUrls(gedPath: string, dbPath: string): RefreshResult {
  const fresh = mapGedcom(parseGedcom(fs.readFileSync(gedPath, 'utf-8'))).media
    .map(m => ({ ...m, photoRin: photoRinOf(m.rawTags ?? null) }));
  const db = createDb(dbPath);
  const rows = db.select().from(media).where(ne(media.downloadStatus, 'done')).all();

  const claimed = new Set<number>();
  const find = (pred: (f: (typeof fresh)[number]) => boolean): number | undefined => {
    const idx = fresh.findIndex((f, i) => !claimed.has(i) && pred(f));
    return idx === -1 ? undefined : idx;
  };

  let matched = 0;
  const unmatched: RefreshResult['unmatched'] = [];
  for (const row of rows) {
    const rin = photoRinOf(row.rawTags);
    const idx =
      (rin != null ? find(f => f.photoRin === rin) : undefined) ??
      (row.filesize != null ? find(f => f.ownerId === row.ownerId && f.filesize === row.filesize) : undefined) ??
      (row.title ? find(f => f.ownerId === row.ownerId && f.title === row.title) : undefined);
    if (idx !== undefined) {
      claimed.add(idx);
      db.update(media)
        .set({ originalUrl: fresh[idx].originalUrl, downloadStatus: 'pending' })
        .where(eq(media.id, row.id))
        .run();
      matched++;
    } else {
      unmatched.push({ id: row.id, reason: 'no match in the new export' });
    }
  }
  return { matched, unmatched, total: rows.length };
}
