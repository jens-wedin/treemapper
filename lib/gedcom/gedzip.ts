import fs from 'node:fs';
import { zipSync, unzipSync, strToU8, strFromU8, type Zippable, type UnzipFileInfo } from 'fflate';
import type { Db } from '../../db/client';
import { media } from '../../db/schema';
import { exportGedcom } from '../gedcomExport';
import { safeFormExt } from './mediaType';

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
    // The entry name is spliced from the row's form, which is stored verbatim
    // and can be attacker-controlled on a foreign import; safeFormExt keeps a
    // .gdz *we* produce from carrying a path-traversal entry name that a naive
    // third-party extractor might follow. Our own importer never treats an entry
    // name as a path, but other tools might.
    const name = `${m.id}.${safeFormExt(m.form) ?? 'jpg'}`;
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

const NO_GEDCOM = 'This .gdz has no gedcom.ged entry — it is not a GEDZIP archive.';

// `unzipSync` inflates every entry fully into memory, so a small archive can
// declare gigabytes and exhaust it (a decompression bomb). The user chose the
// file, but a .gdz is opaque and may be foreign, so cap the total uncompressed
// size at 50× the archive — far above real photos (~1×) or GEDCOM text (~10×),
// far below a bomb (~1000×) — with a 64 MB floor so a legitimately small archive
// is never refused. fflate calls the filter before inflating an entry, so a
// throw here stops the bomb before it allocates. (maxBytes is exposed only so a
// test can trip the guard without allocating gigabytes.)
function unzipCapped(bytes: Uint8Array, want: (name: string) => boolean, maxBytes?: number) {
  const cap = maxBytes ?? Math.max(64 * 1024 * 1024, bytes.length * 50);
  let total = 0;
  return unzipSync(bytes, {
    filter: (f: UnzipFileInfo) => {
      if (!want(f.name)) return false;
      total += f.originalSize;
      if (total > cap) throw new Error('This .gdz expands to far more than its own size — refusing to unpack a possible decompression bomb.');
      return true;
    },
  });
}

/**
 * Unzip a GEDZIP: return its `gedcom.ged` text and a map of every other entry's
 * bytes (the bundled media, keyed by their in-archive path). Throws if the
 * archive has no `gedcom.ged` — that is what separates a GEDZIP from any old zip.
 */
export function readGedzip(bytes: Uint8Array, opts: { maxBytes?: number } = {}): { gedcomText: string; media: Map<string, Uint8Array> } {
  const entries = unzipCapped(bytes, () => true, opts.maxBytes);
  const gedcom = entries['gedcom.ged'];
  if (!gedcom) throw new Error(NO_GEDCOM);
  const media = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) if (name !== 'gedcom.ged') media.set(name, data);
  return { gedcomText: strFromU8(gedcom), media };
}

/**
 * Read only the `gedcom.ged` text out of a GEDZIP, leaving the (potentially
 * large) bundled photos in the archive un-inflated. The upload pre-check needs
 * just the GEDCOM to answer "does this hold any people?"; extracting the media
 * is `readGedzip`'s (and the real import's) job.
 */
export function readGedzipText(bytes: Uint8Array, opts: { maxBytes?: number } = {}): string {
  const entries = unzipCapped(bytes, name => name === 'gedcom.ged', opts.maxBytes);
  const gedcom = entries['gedcom.ged'];
  if (!gedcom) throw new Error(NO_GEDCOM);
  return strFromU8(gedcom);
}
