import fs from 'node:fs';
import { zipSync, strToU8, type Zippable } from 'fflate';
import type { Db } from '../../db/client';
import { media } from '../../db/schema';
import { exportGedcom } from '../gedcomExport';

/**
 * A FamilySearch GEDZIP (.gdz): a zip holding `gedcom.ged` (GEDCOM 7.0) plus the
 * tree's downloaded photos. Each bundled photo's FILE payload is rewritten from
 * its CDN URL to a bundle-relative name (`<id>.<form>`); photos not downloaded
 * stay as URLs. GEDZIP is 7.0-only (spec §GEDZIP).
 */
export function buildGedzip(db: Db, opts: { now?: Date } = {}): Uint8Array {
  const rows = db.select().from(media).all();
  const bundleName = new Map<number, string>();
  const files: Zippable = {};

  for (const m of rows) {
    if (m.downloadStatus !== 'done' || !m.localPath || !fs.existsSync(m.localPath)) continue;
    const name = `${m.id}.${m.form ?? 'jpg'}`;
    bundleName.set(m.id, name);
    // Images are already compressed — store (level 0) rather than deflate.
    files[name] = [new Uint8Array(fs.readFileSync(m.localPath)), { level: 0 }];
  }

  const ged = exportGedcom(db, {
    version: '7.0',
    now: opts.now,
    mediaFilePath: m => bundleName.get(m.id) ?? null,
  });
  // gedcom.ged is text — worth deflating.
  files['gedcom.ged'] = [strToU8(ged), { level: 6 }];

  return zipSync(files);
}
