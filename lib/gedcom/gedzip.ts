import fs from 'node:fs';
import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import type { Db } from '../../db/client';
import { media } from '../../db/schema';
import { exportGedcom } from '../gedcomExport';

/**
 * A FamilySearch GEDZIP (.gdz): a zip holding `gedcom.ged` (GEDCOM 7.0) plus the
 * tree's downloaded photos. Each bundled photo's FILE payload is rewritten from
 * its CDN URL to a bundle-relative name (`<id>.<form>`); photos not downloaded
 * stay as URLs. GEDZIP is 7.0-only (spec §GEDZIP).
 *
 * Reads every bundled photo into memory and zips synchronously — fine for
 * this local single-user app; revisit (streaming) only if a tree's media
 * grows very large.
 */
export function buildGedzip(db: Db, opts: { now?: Date } = {}): Uint8Array {
  const rows = db.select().from(media).all();
  const bundleName = new Map<number, string>();
  const files: Zippable = {};

  for (const m of rows) {
    if (m.ownerType !== 'person' || m.downloadStatus !== 'done' || !m.localPath || !fs.existsSync(m.localPath))
      continue;
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

/** A zip archive starts with the local-file-header magic `PK\x03\x04`. */
export function isZip(bytes: Buffer | Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Unzip a GEDZIP: return its `gedcom.ged` text and a map of every other entry's
 * bytes (the bundled media, keyed by their in-archive path). Throws if the
 * archive has no `gedcom.ged` — that is what separates a GEDZIP from any old zip.
 */
export function readGedzip(bytes: Uint8Array): { gedcomText: string; media: Map<string, Uint8Array> } {
  const entries = unzipSync(bytes);
  const gedcom = entries['gedcom.ged'];
  if (!gedcom) throw new Error('This .gdz has no gedcom.ged entry — it is not a GEDZIP archive.');
  const media = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) if (name !== 'gedcom.ged') media.set(name, data);
  return { gedcomText: strFromU8(gedcom), media };
}
