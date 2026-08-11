import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runImport, type ImportSummary } from '../lib/import';

export { runImport, type ImportSummary };

function writeReport(summary: ImportSummary, gedPath: string, reportPath: string) {
  const lines = [
    `# Importrapport — ${new Date().toISOString()}`,
    ``,
    `Source: \`${gedPath}\``,
    ``,
    `| Tabell | Antal |`,
    `|---|---|`,
    ...Object.entries(summary.inserted).map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `Records in the file: ${summary.sourceRecords.INDI} INDI · ${summary.sourceRecords.FAM} FAM · ${summary.sourceRecords.SOUR} SOUR · ${summary.sourceRecords.ALBUM} ALBUM (albums are not modelled)`,
    ``,
    `## Varningar (${summary.warnings.length})`,
    ...(summary.warnings.length ? summary.warnings.map(w => `- ${w}`) : ['Inga.']),
    ``,
    `Photos to download: ${summary.inserted.media} — run \`npm run media\`.`,
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gedPath = process.argv[2] ?? 'data/Wedin_Family_Tree_CLEANED.ged';
  const dbPath = process.argv[3] ?? 'wedin.db';
  if (fs.existsSync(dbPath)) {
    console.error(`Refusing to overwrite the existing database: ${dbPath}. Remove it first if you mean to import again.`);
    process.exit(1);
  }
  const summary = runImport(gedPath, dbPath);
  const reportPath = 'data/import-report.md';
  writeReport(summary, gedPath, reportPath);
  console.log(`Import done: ${summary.inserted.persons} people, ${summary.inserted.families} families, ${summary.inserted.sources} sources, ${summary.inserted.media} photos (pending).`);
  console.log(`Rapport: ${reportPath}`);
  if (summary.warnings.length) console.log(`⚠ ${summary.warnings.length} varningar — se rapporten.`);
}
