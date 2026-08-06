import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseGedcom } from '../lib/gedcom/parser';
import { mapGedcom } from '../lib/gedcom/mapper';
import { createDb } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media, auditLog } from '../db/schema';

export interface ImportSummary {
  inserted: { persons: number; families: number; familyChildren: number; events: number; sources: number; citations: number; media: number };
  sourceRecords: { INDI: number; FAM: number; SOUR: number; ALBUM: number };
  warnings: string[];
}

const CHUNK = 500;
function chunkInsert<T>(insert: (rows: T[]) => void, rows: T[]) {
  for (let i = 0; i < rows.length; i += CHUNK) insert(rows.slice(i, i + CHUNK));
}

export function runImport(gedPath: string, dbPath: string): ImportSummary {
  const text = fs.readFileSync(gedPath, 'utf-8');
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
  return { inserted, sourceRecords, warnings };
}

function writeReport(summary: ImportSummary, gedPath: string, reportPath: string) {
  const lines = [
    `# Importrapport — ${new Date().toISOString()}`,
    ``,
    `Källa: \`${gedPath}\``,
    ``,
    `| Tabell | Antal |`,
    `|---|---|`,
    ...Object.entries(summary.inserted).map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `Källposter: ${summary.sourceRecords.INDI} INDI · ${summary.sourceRecords.FAM} FAM · ${summary.sourceRecords.SOUR} SOUR · ${summary.sourceRecords.ALBUM} ALBUM (album modelleras inte)`,
    ``,
    `## Varningar (${summary.warnings.length})`,
    ...(summary.warnings.length ? summary.warnings.map(w => `- ${w}`) : ['Inga.']),
    ``,
    `Foton att ladda ner: ${summary.inserted.media} — kör \`npm run media\`.`,
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gedPath = process.argv[2] ?? 'data/Wedin_Family_Tree_CLEANED.ged';
  const dbPath = process.argv[3] ?? 'wedin.db';
  if (fs.existsSync(dbPath)) {
    console.error(`Vägrar skriva över befintlig databas: ${dbPath}. Ta bort den först om du vill importera om.`);
    process.exit(1);
  }
  const summary = runImport(gedPath, dbPath);
  const reportPath = 'data/import-report.md';
  writeReport(summary, gedPath, reportPath);
  console.log(`Import klar: ${summary.inserted.persons} personer, ${summary.inserted.families} familjer, ${summary.inserted.sources} källor, ${summary.inserted.media} foton (pending).`);
  console.log(`Rapport: ${reportPath}`);
  if (summary.warnings.length) console.log(`⚠ ${summary.warnings.length} varningar — se rapporten.`);
}
