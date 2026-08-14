/**
 * Reads a GEDCOM into a new family tree.
 *
 *   npm run import -- family.ged "Mormors släkt"     → trees/mormors-slakt.db
 *
 * The tree's name decides the filename, through the same `allocateId` the
 * import form in the browser uses — so the two agree, and neither writes to a
 * database named after whoever wrote this. The default tree lives at
 * `trees/wedin.db`, in the same folder as every other family database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runImport, type ImportSummary } from '../lib/import';
import { createTree } from '../lib/trees';
import { UnsupportedGedcom } from '../lib/gedcom/detect';

export { runImport, type ImportSummary };

/**
 * What the command line asked for, or why it cannot be honoured.
 *
 * Neither argument has a default. Both used to: the file defaulted to
 * `data/Wedin_Family_Tree_CLEANED.ged` and the database to `wedin.db`, so
 * running the command bare tried to import one particular family into a file
 * named after them.
 */
export function readArgs(argv: string[]): { gedPath: string; name: string } | { error: string } {
  const [gedPath, name] = argv;
  if (!gedPath?.trim()) {
    return { error: 'Which GEDCOM file? Usage: npm run import -- <file.ged> "<name of the tree>"' };
  }
  if (!name?.trim()) {
    return { error: 'What is the tree called? The name becomes its filename: npm run import -- <file.ged> "<name of the tree>"' };
  }
  return { gedPath: gedPath.trim(), name: name.trim() };
}

function writeReport(summary: ImportSummary, gedPath: string, reportPath: string) {
  const lines = [
    `# Import report — ${new Date().toISOString()}`,
    ``,
    `Source: \`${gedPath}\``,
    ``,
    `| Table | Rows |`,
    `|---|---|`,
    ...Object.entries(summary.inserted).map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `Records in the file: ${summary.sourceRecords.INDI} INDI · ${summary.sourceRecords.FAM} FAM · ${summary.sourceRecords.SOUR} SOUR · ${summary.sourceRecords.ALBUM} ALBUM (albums are not modelled)`,
    ``,
    `## Warnings (${summary.warnings.length})`,
    ...(summary.warnings.length ? summary.warnings.map(w => `- ${w}`) : ['None.']),
    ``,
    `Photos to download: ${summary.inserted.media} — run \`npm run media -- <tree>\`.`,
  ];
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = readArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(args.error);
    process.exit(1);
  }
  if (!fs.existsSync(args.gedPath)) {
    console.error(`No such file: ${args.gedPath}`);
    process.exit(1);
  }

  try {
    const { tree, summary } = createTree(args.name, args.gedPath, path.basename(args.gedPath));
    const reportPath = 'data/import-report.md';
    writeReport(summary, args.gedPath, reportPath);

    console.log(`Imported into "${tree.name}" (trees/${tree.id}.db):`);
    console.log(`  ${summary.inserted.persons} people, ${summary.inserted.families} families, ${summary.inserted.sources} sources, ${summary.inserted.media} photos (pending).`);
    console.log(`Report: ${reportPath}`);
    if (summary.warnings.length) console.log(`⚠ ${summary.warnings.length} warnings — see the report.`);
    console.log(`Open it at /${tree.id}`);
  } catch (err) {
    if (err instanceof UnsupportedGedcom) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
