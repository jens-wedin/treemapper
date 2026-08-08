/**
 * Folds a branch that was imported more than once back into a single line.
 *
 * MyHeritage exports can carry the same family several times over, each copy
 * with its own ids: the same couple, the same children, the same grandchildren.
 * Konsekvensbänken flags them a pair at a time, which is the wrong shape of
 * tool for fifty of them, so this walks the whole branch from a seed person,
 * clusters the records that are the same person (lib/duplicateClusters.ts) and
 * merges each cluster into its best-sourced record.
 *
 * Order matters and is not negotiable: **children before parents**. While the
 * copies still hang under separate families, two siblings born on the same day
 * are twins and are left alone; once the parents are one person they all sit
 * in one family and that distinction is gone. Merging the parents last is also
 * what lets the duplicated marriages collapse (see lib/merge.ts).
 *
 * Anything ambiguous is reported rather than guessed at — records without a
 * birth date, or whose names differ by more than word order, are left for a
 * human to merge in Konsekvensbänken.
 *
 * Usage: npm run merge-duplicates -- <person-id> [...]   (add --apply to write)
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events } from '../db/schema';
import { branchMembers, duplicateClusters } from '../lib/duplicateClusters';
import { mergePersons } from '../lib/merge';
import { removeChildLink } from '../lib/mutations';
import { detectIssues } from '../lib/issues';

const MAX_ROUNDS = 8;

const name = (db: Db, id: string) => {
  const p = db.select().from(persons).where(eq(persons.id, id)).all()[0];
  return p ? `${p.givenName} ${p.surname}`.replace(/\s+/g, ' ').trim() || id : `${id} (borttagen)`;
};

export function mergeDuplicates(dbPath: string, seed: string[], apply: boolean) {
  const db = createDb(dbPath);
  const count = () => ({
    persons: db.select().from(persons).all().length,
    families: db.select().from(families).all().length,
    issues: detectIssues(db).length,
  });

  const before = count();
  console.log(`Utgångsläge: ${before.persons} personer, ${before.families} familjer, ${before.issues} konsekvensproblem`);

  const scope = branchMembers(db, seed);
  console.log(`Grenen omfattar ${scope.size} personer.\n`);

  let merged = 0;
  const failures: string[] = [];

  /**
   * Two records that are the same person, where one is recorded as a child of
   * the other, make that parent link false by definition — nobody is their own
   * child. It is also what makes the merge refuse (same ancestry line), so the
   * link has to go first. Only links *inside* a cluster are touched: real
   * parentage elsewhere is left alone.
   */
  const detachInsideCluster = (ids: string[]) => {
    const fams = db.select().from(families).all();
    for (const link of db.select().from(familyChildren).all()) {
      if (!ids.includes(link.childId)) continue;
      const family = fams.find(f => f.id === link.familyId);
      if (!family) continue;
      const parentInCluster = [family.husbandId, family.wifeId]
        .find(p => p && p !== link.childId && ids.includes(p));
      if (!parentInCluster) continue;
      console.log(`  lossar ${link.childId} ur ${link.familyId}: står som barn till ${parentInCluster}, som är samma person`);
      if (apply) removeChildLink(db, link.familyId, link.childId);
    }
  };

  // Barnen först, i rundor: varje sammanslagning kan avslöja nya dubbletter en
  // generation ned, när två grenar plötsligt sitter under samma förälder.
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const members = branchMembers(db, seed);
    for (const id of seed) members.delete(id);
    const clusters = duplicateClusters(db, members);
    if (!clusters.length) {
      console.log(`Runda ${round}: inget mer att slå ihop bland ättlingarna.`);
      break;
    }
    console.log(`Runda ${round}: ${clusters.length} klungor`);
    for (const { ids } of clusters) {
      const [survivor, ...duplicates] = ids;
      console.log(`  behåll ${survivor} ${name(db, survivor!).padEnd(34)} ← ${duplicates.join(', ')}`);
      detachInsideCluster(ids);
      for (const duplicate of duplicates) {
        try {
          if (apply) mergePersons(db, { survivorId: survivor!, duplicateId: duplicate });
          merged++;
        } catch (err) {
          failures.push(`${duplicate} → ${survivor}: ${(err as Error).message}`);
        }
      }
    }
    if (!apply) break;   // utan skrivning ser nästa runda exakt likadan ut
  }

  // … och sedan utgångspersonerna själva, vilket fäller ihop deras familjer.
  // Flera varv: fäderna kan bara paras ihop på partner, och partnern blir en
  // enda person först när modern har slagits ihop.
  const living = () => new Set(seed.filter(id => db.select().from(persons).where(eq(persons.id, id)).all().length));
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const clusters = duplicateClusters(db, living());
    if (!clusters.length) break;
    let progress = 0;
    for (const { ids } of clusters) {
      const [survivor, ...duplicates] = ids;
      console.log(`\nUtgångspersoner: behåll ${survivor} ${name(db, survivor!)} ← ${duplicates.join(', ')}`);
      detachInsideCluster(ids);
      for (const duplicate of duplicates) {
        try {
          if (apply) mergePersons(db, { survivorId: survivor!, duplicateId: duplicate });
          merged++;
          progress++;
        } catch (err) {
          failures.push(`${duplicate} → ${survivor}: ${(err as Error).message}`);
        }
      }
    }
    if (!apply || !progress) break;   // ett varv utan framsteg upprepar sig i evighet
  }

  // Vad som blev kvar och behöver en människas omdöme. Klustringen kräver
  // exakt samma födelsedatum, så den som skrivits av med olika noggrannhet
  // ("1784" mot "11 NOV 1784") eller rent olika ("5 MAR 1785") står kvar. Den
  // gissar inte — den pekar.
  const left = branchMembers(db, seed);
  const people = new Map(db.select().from(persons).all().map(p => [p.id, p]));
  const famsNow = db.select().from(families).all();
  const linksNow = db.select().from(familyChildren).all();
  const evNow = db.select().from(events).all();
  const birthOf = new Map<string, string>();
  for (const e of evNow) {
    if (e.ownerType === 'person' && e.type === 'BIRT' && e.dateRaw && !birthOf.has(e.ownerId)) birthOf.set(e.ownerId, e.dateRaw);
  }
  // Uppslag byggda en gång: paret-mot-paret-jämförelsen nedan är kvadratisk,
  // och en tabellgenomsökning per jämförelse tar minuter i stället för
  // millisekunder.
  const partnerSet = new Map<string, Set<string>>();
  const childSet = new Map<string, Set<string>>();
  const childrenByFamily = new Map<string, string[]>();
  for (const l of linksNow) {
    const list = childrenByFamily.get(l.familyId) ?? [];
    list.push(l.childId);
    childrenByFamily.set(l.familyId, list);
  }
  for (const f of famsNow) {
    for (const [self, partner] of [[f.husbandId, f.wifeId], [f.wifeId, f.husbandId]]) {
      if (!self) continue;
      const partners = partnerSet.get(self) ?? new Set<string>();
      if (partner) partners.add(partner);
      partnerSet.set(self, partners);
      const kids = childSet.get(self) ?? new Set<string>();
      for (const c of childrenByFamily.get(f.id) ?? []) kids.add(c);
      childSet.set(self, kids);
    }
  }
  const overlaps = (a: Set<string> | undefined, b: Set<string> | undefined) =>
    !!a && !!b && [...a].some(x => b.has(x));

  const candidates: string[] = [];
  const members = [...left];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = people.get(members[i]!), b = people.get(members[j]!);
      if (!a || !b) continue;
      // Båda kraven behövs. Att dela barn säger ingenting i sig — det gör
      // varje gift par. Att dela partner räcker inte heller: en änka som gifte
      // om sig ger två män med samma hustru. Men två poster som både är gifta
      // med samma tredje person OCH har samma barn är samma människa.
      if (!overlaps(partnerSet.get(a.id), partnerSet.get(b.id))) continue;
      if (!overlaps(childSet.get(a.id), childSet.get(b.id))) continue;
      if (birthOf.get(a.id) && birthOf.get(a.id) === birthOf.get(b.id)) continue;   // hade klustrats
      candidates.push(
        `${a.id} ${name(db, a.id)} (f. ${birthOf.get(a.id) ?? '—'}) och ${b.id} ${name(db, b.id)} (f. ${birthOf.get(b.id) ?? '—'})`
        + ' — gifta med samma person och med samma barn, men olika födelsedatum',
      );
    }
  }

  const twins: string[] = [];
  for (const id of left) {
    const p = people.get(id);
    if (!p || birthOf.get(id)) continue;
    const sameFamily = linksNow.filter(l => linksNow.some(o => o.childId === id && o.familyId === l.familyId));
    const namesakes = sameFamily.filter(l => {
      const other = people.get(l.childId);
      return other && other.id !== id
        && `${other.givenName} ${other.surname}`.trim().toLowerCase() === `${p.givenName} ${p.surname}`.trim().toLowerCase();
    });
    if (namesakes.length) twins.push(`${id} ${name(db, id)} — samma namn som ${namesakes.map(l => l.childId).join(', ')} i samma familj, ingen av dem har födelsedatum`);
  }

  if (candidates.length || twins.length) {
    console.log('\nKvar för handpåläggning (slås ihop i Konsekvensbänken om du håller med):');
    for (const line of [...new Set([...candidates, ...twins])]) console.log('  ' + line);
  }
  if (failures.length) {
    console.log('\nMisslyckades:');
    for (const line of failures) console.log('  ✗ ' + line);
  }

  const after = count();
  console.log(`\n${merged} sammanslagningar${apply ? '' : ' (torrkörning)'}`);
  console.log(`Efter: ${after.persons} personer, ${after.families} familjer, ${after.issues} konsekvensproblem`);
  console.log(`Skillnad: ${after.persons - before.persons} personer, ${after.families - before.families} familjer, ${after.issues - before.issues} problem`);

  if (!apply) console.log('\nTorrkörning — inget skrevs. Kör med --apply för att spara.');
  return { merged, failures, before, after };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const apply = process.argv.includes('--apply');
  const seed = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dbPath = process.env.WEDIN_DB ?? 'wedin.db';
  if (!seed.length) {
    console.error('Ange minst en person att utgå från: npm run merge-duplicates -- I500101 I500102');
    process.exit(1);
  }
  if (apply) {
    // Aldrig skriva över en tidigare säkerhetskopia.
    let backup = `${dbPath}.before-merge`;
    for (let n = 2; fs.existsSync(backup); n++) backup = `${dbPath}.before-merge.${n}`;
    fs.copyFileSync(dbPath, backup);
    console.log(`Säkerhetskopia: ${backup}\n`);
  }
  mergeDuplicates(dbPath, seed, apply);
}
