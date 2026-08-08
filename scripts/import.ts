import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runImport, type ImportSummary } from '../lib/import';

export { runImport, type ImportSummary };

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
