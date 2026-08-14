import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { parseGedcom } from './gedcom/parser';
import { mapGedcom } from './gedcom/mapper';
import { detectGedcom, type SupportedVersion } from './gedcom/detect';
import { isZip, readGedzip } from './gedcom/gedzip';
import { createDb } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media, auditLog, rawRecords } from '../db/schema';

export interface ImportSummary {
  inserted: { persons: number; families: number; familyChildren: number; events: number; sources: number; citations: number; media: number };
  sourceRecords: { INDI: number; FAM: number; SOUR: number; ALBUM: number };
  warnings: string[];
  version: SupportedVersion;
  schema: Record<string, string>;
}

const CHUNK = 500;
function chunkInsert<T>(insert: (rows: T[]) => void, rows: T[]) {
  for (let i = 0; i < rows.length; i += CHUNK) insert(rows.slice(i, i + CHUNK));
}

/**
 * Reads a GEDCOM file into a **new** database at `dbPath`.
 *
 * Lives in lib/ rather than scripts/ because the API imports it too: a tree
 * created from the browser and one created from the terminal must be the same
 * thing. scripts/import.ts is the command-line wrapper around it.
 *
 * When `gedPath` is a GEDZIP (.gdz), the gedcom.ged inside is imported and the
 * bundled photos are extracted into `mediaDir` (given by the caller that knows
 * the tree id — createTree). A plain .ged never enters that branch.
 */
export function runImport(gedPath: string, dbPath: string, mediaDir?: string): ImportSummary {
  const bytes = fs.readFileSync(gedPath);
  const gedzip = isZip(bytes) ? readGedzip(bytes) : null;
  const { version, text } = detectGedcom(gedzip ? Buffer.from(gedzip.gedcomText, 'utf-8') : bytes);
  const parseWarnings: string[] = [];
  const records = parseGedcom(text, parseWarnings);
  const mapped = mapGedcom(records, gedzip ? { localFiles: new Set(gedzip.media.keys()) } : {});
  const warnings = [...parseWarnings, ...mapped.warnings];

  const sourceRecords = {
    INDI: records.filter(r => r.tag === 'INDI').length,
    FAM: records.filter(r => r.tag === 'FAM').length,
    SOUR: records.filter(r => r.tag === 'SOUR').length,
    ALBUM: mapped.albums,
  };
  if (mapped.persons.length !== sourceRecords.INDI) throw new Error(`Person count mismatch: mapped ${mapped.persons.length}, source ${sourceRecords.INDI}`);
  if (mapped.families.length !== sourceRecords.FAM) throw new Error(`Family count mismatch: mapped ${mapped.families.length}, source ${sourceRecords.FAM}`);
  if (mapped.sources.length !== sourceRecords.SOUR) throw new Error(`Source count mismatch: mapped ${mapped.sources.length}, source ${sourceRecords.SOUR}`);

  const db = createDb(dbPath);
  try {
    db.transaction(tx => {
      chunkInsert(r => tx.insert(persons).values(r).run(), mapped.persons);
      chunkInsert(r => tx.insert(families).values(r).run(), mapped.families);
      chunkInsert(r => tx.insert(familyChildren).values(r).run(), mapped.familyChildren);
      chunkInsert(r => tx.insert(events).values(r).run(), mapped.events);
      chunkInsert(r => tx.insert(sources).values(r).run(), mapped.sources);
      chunkInsert(r => tx.insert(citations).values(r).run(), mapped.citations);
      chunkInsert(r => tx.insert(media).values(r).run(), mapped.media);
      chunkInsert(r => tx.insert(rawRecords).values(r).run(), mapped.rawRecords);
      tx.insert(auditLog).values({
        timestamp: new Date().toISOString(),
        action: 'import',
        entityType: 'gedcom',
        entityId: path.basename(gedPath),
        after: JSON.stringify(sourceRecords),
      }).run();
    });

    // Extract the GEDZIP's bundled photos into the tree's media folder and
    // finalise their rows. A bundled media row's originalUrl is the archive
    // entry name (so gedzip.media.get finds it); an undownloaded http-URL row
    // is not in the archive and stays 'pending'. The on-disk name is derived
    // from the row id + form — never from the archive entry name — so a
    // crafted entry ("../../…") cannot escape mediaDir (zip-slip).
    if (gedzip && mediaDir) {
      fs.mkdirSync(mediaDir, { recursive: true });
      for (const m of db.select().from(media).all()) {
        const data = gedzip.media.get(m.originalUrl);
        if (!data) continue;
        const dest = path.join(mediaDir, `${m.id}.${m.form ?? 'jpg'}`);
        fs.writeFileSync(dest, data);
        db.update(media).set({ localPath: dest, downloadStatus: 'done' }).where(eq(media.id, m.id)).run();
      }
    }

    const inserted = {
      persons: db.select().from(persons).all().length,
      families: db.select().from(families).all().length,
      familyChildren: db.select().from(familyChildren).all().length,
      events: db.select().from(events).all().length,
      sources: db.select().from(sources).all().length,
      citations: db.select().from(citations).all().length,
      media: db.select().from(media).all().length,
    };
    if (inserted.persons !== mapped.persons.length) throw new Error('Inserted person count mismatch');
    return { inserted, sourceRecords, warnings, version, schema: mapped.schema };
  } finally {
    // The server imports repeatedly; a handle per import would accumulate.
    db.$client.close();
  }
}
