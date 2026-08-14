import fs from 'node:fs';
import path from 'node:path';
import { parseGedcom } from './gedcom/parser';
import { mapGedcom } from './gedcom/mapper';
import { detectGedcom, type SupportedVersion } from './gedcom/detect';
import { createDb } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media, auditLog } from '../db/schema';

export interface ImportSummary {
  inserted: { persons: number; families: number; familyChildren: number; events: number; sources: number; citations: number; media: number };
  sourceRecords: { INDI: number; FAM: number; SOUR: number; ALBUM: number };
  warnings: string[];
  version: SupportedVersion;
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
 */
export function runImport(gedPath: string, dbPath: string): ImportSummary {
  const { version, text } = detectGedcom(fs.readFileSync(gedPath));
  const parseWarnings: string[] = [];
  const records = parseGedcom(text, parseWarnings);
  const mapped = mapGedcom(records);
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
      tx.insert(auditLog).values({
        timestamp: new Date().toISOString(),
        action: 'import',
        entityType: 'gedcom',
        entityId: path.basename(gedPath),
        after: JSON.stringify(sourceRecords),
      }).run();
    });

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
    return { inserted, sourceRecords, warnings, version };
  } finally {
    // The server imports repeatedly; a handle per import would accumulate.
    db.$client.close();
  }
}
