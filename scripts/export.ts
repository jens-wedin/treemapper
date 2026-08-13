import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDb } from '../db/client';
import { exportGedcom } from '../lib/gedcomExport';
import { buildGedzip } from '../lib/gedcom/gedzip';
import { persons, families, sources, treeMeta } from '../db/schema';

export function runExport(outPath: string, dbPath?: string, version?: '5.5.1' | '7.0', gdz = false): { path: string; bytes: number; counts: Record<string, number> } {
  const db = dbPath ? createDb(dbPath) : createDb();
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  let bytes: number;
  if (gdz) {
    const zip = buildGedzip(db);
    fs.writeFileSync(outPath, zip);
    bytes = zip.byteLength;
  } else {
    const stored = db.select().from(treeMeta).all()[0]?.gedcomFormat;
    const v = version ?? (stored === '5.5.1' ? '5.5.1' : '7.0');
    const text = exportGedcom(db, { version: v });
    fs.writeFileSync(outPath, text, 'utf-8');
    bytes = Buffer.byteLength(text, 'utf-8');
  }
  return {
    path: outPath,
    bytes,
    counts: {
      persons: db.select().from(persons).all().length,
      families: db.select().from(families).all().length,
      sources: db.select().from(sources).all().length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stamp = new Date().toISOString().slice(0, 10);
  const rawArgs = process.argv.slice(2);
  const formatArg = rawArgs.find(a => a.startsWith('--format='))?.split('=')[1];
  const version = formatArg === '5.5.1' || formatArg === '7.0' ? formatArg : undefined;
  const gdz = rawArgs.includes('--gdz');
  const positionals = rawArgs.filter(a => !a.startsWith('--'));
  const outPath = positionals[0] ?? `data/wedin-export-${stamp}.${gdz ? 'gdz' : 'ged'}`;
  const result = runExport(outPath, positionals[1], version, gdz);
  const { persons: people, families: fams, sources: srcs } = result.counts;
  console.log(`Export done: ${people} people, ${fams} families, ${srcs} sources.`);
  console.log(`File: ${result.path} (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
}
