import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDb } from '../db/client';
import { exportGedcom } from '../lib/gedcomExport';
import { persons, families, sources } from '../db/schema';

export function runExport(outPath: string, dbPath?: string): { path: string; bytes: number; counts: Record<string, number> } {
  const db = dbPath ? createDb(dbPath) : createDb();
  const text = exportGedcom(db);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, text, 'utf-8');
  return {
    path: outPath,
    bytes: Buffer.byteLength(text, 'utf-8'),
    counts: {
      persons: db.select().from(persons).all().length,
      families: db.select().from(families).all().length,
      sources: db.select().from(sources).all().length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = process.argv[2] ?? `data/wedin-export-${stamp}.ged`;
  const result = runExport(outPath, process.argv[3]);
  const { persons: people, families: fams, sources: srcs } = result.counts;
  console.log(`Export done: ${people} people, ${fams} families, ${srcs} sources.`);
  console.log(`File: ${result.path} (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
}
