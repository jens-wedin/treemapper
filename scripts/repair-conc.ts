/**
 * Restores the line breaks MyHeritage lost inside CONC-folded values.
 *
 * The export writes every logical line as its own CONC and never uses CONT,
 * so before the parser learned to tell the two apart, values arrived run
 * together: "Sven-Erik WedinKön: ManHemvist: Sundsvall". The parser is fixed,
 * but the database still holds the old text, and re-importing would throw away
 * everything edited since.
 *
 * So this re-imports the same GEDCOM into a scratch database and copies the
 * corrected text across, under two rules:
 *
 *   1. A field is only rewritten when the *sole* difference is where the line
 *      breaks fall — ignoring newlines, the text must be character-identical.
 *      Anything else means the row is not what the import produced, and it is
 *      left alone and reported.
 *   2. Anything with an entry in audit_log has been edited by hand and is
 *      skipped outright.
 *
 * Usage: npm run repair-conc [-- <file.ged> <db>]   (add --apply to write)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { runImport } from './import';

/** Text columns per table, and how a row is matched between the two databases. */
const TABLES = [
  { name: 'persons', key: ['id'], columns: ['given_name', 'surname', 'married_name', 'suffix', 'note', 'raw_tags'] },
  { name: 'families', key: ['id'], columns: ['note', 'raw_tags'] },
  { name: 'sources', key: ['id'], columns: ['title', 'author', 'publication', 'note', 'raw_tags'] },
  { name: 'events', key: ['owner_type', 'owner_id', 'type'], columns: ['date_raw', 'place', 'description', 'age', 'raw_tags'] },
  { name: 'citations', key: ['owner_type', 'owner_id', 'source_id'], columns: ['page', 'text', 'raw_tags'] },
  { name: 'media', key: ['owner_type', 'owner_id'], columns: ['title', 'original_url', 'raw_tags'] },
] as const;

/** The entity a row belongs to, for checking against the audit log. */
const OWNER = { persons: 'person', families: 'family', sources: 'source' } as const;

type Row = Record<string, string | number | null>;

/**
 * Equal once every line break is taken out. `raw_tags` holds JSON, where a
 * break is the escaped two-character `\n`, so both spellings are removed —
 * otherwise the JSON columns look like they changed in some other way and get
 * skipped, leaving the export writing the old run-on text.
 */
const withoutBreaks = (value: string | null) => (value ?? '').replace(/\\n|\n/g, '');
const sameIgnoringBreaks = (a: string | null, b: string | null) => withoutBreaks(a) === withoutBreaks(b);

/** Rows in insertion order, grouped by their natural key, so ids need not match. */
function grouped(db: Database.Database, table: string, key: readonly string[], columns: readonly string[]): Map<string, Row[]> {
  const cols = ['id', ...key, ...columns].join(', ');
  const rows = db.prepare(`select ${cols} from ${table} order by id`).all() as Row[];
  const out = new Map<string, Row[]>();
  for (const row of rows) {
    const k = key.map(c => String(row[c])).join(' ');
    const list = out.get(k) ?? [];
    list.push(row);
    out.set(k, list);
  }
  return out;
}

export function repairConc(gedPath: string, dbPath: string, apply: boolean) {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-repair-'));
  const scratchDb = path.join(scratchDir, 'fresh.db');
  console.log(`Läser om ${path.basename(gedPath)} med den rättade tolken …`);
  runImport(gedPath, scratchDb);

  const live = new Database(dbPath);
  const fresh = new Database(scratchDb, { readonly: true });

  // Everything touched by hand since the import — never overwritten.
  const edited = new Set(
    (live.prepare("select entity_type, entity_id from audit_log where action <> 'import'").all() as
      { entity_type: string; entity_id: string }[])
      .map(r => `${r.entity_type} ${r.entity_id}`),
  );
  console.log(`Skyddade handredigerade poster: ${edited.size}`);

  const updates: { table: string; id: number | string; column: string; from: string; to: string }[] = [];
  const skipped: string[] = [];

  for (const { name, key, columns } of TABLES) {
    const liveRows = grouped(live, name, key, columns);
    const freshRows = grouped(fresh, name, key, columns);

    for (const [groupKey, liveList] of liveRows) {
      const freshList = freshRows.get(groupKey);
      if (!freshList || freshList.length !== liveList.length) {
        if (freshList) skipped.push(`${name}: gruppen ${groupKey.replace(/ /g, '/')} har olika antal rader (${liveList.length} mot ${freshList.length})`);
        continue;   // added or removed since import — leave it be
      }
      liveList.forEach((liveRow, i) => {
        const freshRow = freshList[i]!;
        // The audit log names a row by its own id, whichever table it is in.
        const owner = OWNER[name as keyof typeof OWNER];
        const entityType = owner ?? (name === 'events' ? 'event' : name === 'citations' ? 'citation' : 'media');
        if (edited.has(`${entityType} ${liveRow.id}`)) return;
        // and an edited person carries their events, citations and photos along
        if (!owner && edited.has(`person ${liveRow.owner_id}`)) return;

        for (const column of columns) {
          const before = liveRow[column] as string | null;
          const after = freshRow[column] as string | null;
          if (before === after) continue;
          if (!sameIgnoringBreaks(before, after)) {
            skipped.push(`${name}#${liveRow.id}.${column}: skiljer sig på mer än radbrytningar`);
            continue;
          }
          updates.push({ table: name, id: liveRow.id as number, column, from: before ?? '', to: after ?? '' });
        }
      });
    }
  }

  const byTable: Record<string, number> = {};
  for (const u of updates) byTable[`${u.table}.${u.column}`] = (byTable[`${u.table}.${u.column}`] ?? 0) + 1;
  console.log('\nFält som får tillbaka sina radbrytningar:');
  for (const [what, n] of Object.entries(byTable).sort((a, b) => b[1] - a[1])) console.log(`  ${what.padEnd(24)} ${n}`);
  console.log(`  ${'TOTALT'.padEnd(24)} ${updates.length}`);
  if (skipped.length) {
    // Grouped, not listed: a truncated list hides whether something that ought
    // to have been repaired was quietly passed over.
    const bySkip: Record<string, number> = {};
    for (const s of skipped) {
      const m = /^(\w+)#[^.]+\.(\w+):/.exec(s);
      bySkip[m ? `${m[1]}.${m[2]}` : s.split(':')[0]!] = (bySkip[m ? `${m[1]}.${m[2]}` : s.split(':')[0]!] ?? 0) + 1;
    }
    console.log(`\nOrörda, skiljer sig på mer än radbrytningar (${skipped.length}):`);
    for (const [what, n] of Object.entries(bySkip).sort((a, b) => b[1] - a[1])) console.log(`  ${what.padEnd(24)} ${n}`);
  }

  const example = updates.find(u => u.table === 'citations' && u.column === 'text');
  if (example) {
    console.log('\nExempel:');
    console.log('  före:', JSON.stringify(example.from.slice(0, 90)));
    console.log('  efter:', JSON.stringify(example.to.slice(0, 90)));
  }

  if (!apply) {
    console.log('\nTorrkörning — inget skrevs. Kör med --apply för att spara.');
  } else if (updates.length) {
    // Never clobber an earlier backup — a second run would otherwise replace
    // the pristine copy with an already-repaired one.
    let backup = `${dbPath}.before-repair-conc`;
    for (let n = 2; fs.existsSync(backup); n++) backup = `${dbPath}.before-repair-conc.${n}`;
    fs.copyFileSync(dbPath, backup);
    console.log(`\nSäkerhetskopia: ${backup}`);
    const run = live.transaction(() => {
      for (const u of updates) {
        live.prepare(`update ${u.table} set ${u.column} = ? where id = ?`).run(u.to, u.id);
      }
    });
    run();
    console.log(`Uppdaterade ${updates.length} fält.`);
  }

  live.close();
  fresh.close();
  fs.rmSync(scratchDir, { recursive: true, force: true });
  return { updates: updates.length, skipped: skipped.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2).filter(a => a !== '--apply');
  const apply = process.argv.includes('--apply');
  const ged = args[0] ?? 'data/Wedin_Family_Tree_CLEANED.ged';
  const db = args[1] ?? process.env.WEDIN_DB ?? 'wedin.db';
  repairConc(ged, db, apply);
}
