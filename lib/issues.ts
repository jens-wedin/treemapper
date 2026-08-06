import { createHash } from 'node:crypto';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events } from '../db/schema';
import { parseFullDate, daysBetween, yearRange, type FullDate } from './dates';
import { eventLabelSv } from './eventLabels';

export type Severity = 'error' | 'dup' | 'warning' | 'info' | 'minor';
export const SEVERITY_ORDER: Severity[] = ['error', 'dup', 'warning', 'info', 'minor'];

export interface DuplicateGroup {
  name: string;
  year: number | null;
  confidence: 'high' | 'review';
  ids: string[];
}

export interface Issue {
  fingerprint: string;
  category: string;
  severity: Severity;
  text: string;
  /** Everyone involved; [0] owns the queue entry. */
  personIds: string[];
  duplicateGroup?: DuplicateGroup;
}

export interface DetectOptions { referenceYear?: number }

// Thresholds calibrated against MyHeritage's own "Konsekvenskontroll av träd"
// (data/konsekvensproblem.pdf, 2026-07-09, 894 problems / 24 categories).
const MAX_AGE = 110;              // vid liv / dog för gammal
const PARENT_MIN_GAP = 15;        // föräldrar för unga (≤ 15 år emellan)
const PARENT_MAX_GAP = 65;        // förälder för gammal (≥ 65 år emellan)
const SIBLING_MIN_DAYS = 300;     // syskon med nära ålder (< 300 dagar, tvillingar undantagna)
const SPOUSE_MAX_GAP = 35;        // stor åldersskillnad mellan makar
const MARRY_MIN_AGE = 16;         // gift för ung
const MARRIED_MIN_DEATH_AGE = 14; // dog för ung för att vara gift
const SPELLING_RARE_MAX = 1;      // stavningsvariant som förekommer högst 1 gång …
const SPELLING_COMMON_MIN = 3;    // … mot en variant som förekommer minst 3 gånger

/** MyHeritage placeholder record, not a real person. */
const SENTINEL_ID = 'I88888888';

// Events that legitimately happen after death.
const POST_MORTEM_OK = new Set(['DEAT', 'BURI', 'CREM', 'PROB', 'WILL']);

const fingerprint = (category: string, ids: string[], ...values: (string | number | null)[]) =>
  createHash('sha1')
    .update([category, [...ids].sort().join(','), values.map(v => v ?? '').join('|')].join('§'))
    .digest('hex')
    .slice(0, 16);

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const fullName = (p: { givenName: string; surname: string }) =>
  [p.givenName, p.surname].filter(s => s.trim()).join(' ').replace(/\s+/g, ' ').trim();
const firstToken = (given: string) => given.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

/** Levenshtein distance with an early exit at `max`. */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

interface PersonRow { id: string; givenName: string; surname: string; sex: 'M' | 'F' | 'U' }
interface EventRow { ownerType: string; ownerId: string; type: string; dateRaw: string | null; dateYear: number | null; place: string | null }

export function detectIssues(db: Db, opts: DetectOptions = {}): Issue[] {
  const referenceYear = opts.referenceYear ?? new Date().getFullYear();
  const issues: Issue[] = [];
  const add = (
    category: string, severity: Severity, text: string, personIds: string[],
    values: (string | number | null)[], duplicateGroup?: DuplicateGroup,
  ) => {
    issues.push({ fingerprint: fingerprint(category, personIds, ...values), category, severity, text, personIds, ...(duplicateGroup ? { duplicateGroup } : {}) });
  };

  const people = db.select({ id: persons.id, givenName: persons.givenName, surname: persons.surname, sex: persons.sex })
    .from(persons).all().filter(p => p.id !== SENTINEL_ID) as PersonRow[];
  const byId = new Map(people.map(p => [p.id, p]));
  const allEvents = db.select({
    ownerType: events.ownerType, ownerId: events.ownerId, type: events.type,
    dateRaw: events.dateRaw, dateYear: events.dateYear, place: events.place,
  }).from(events).all() as EventRow[];
  const fams = db.select().from(families).all();
  const childLinks = db.select().from(familyChildren).all();

  const personEvents = new Map<string, EventRow[]>();
  const familyEvents = new Map<string, EventRow[]>();
  for (const e of allEvents) {
    const target = e.ownerType === 'person' ? personEvents : familyEvents;
    const list = target.get(e.ownerId) ?? [];
    list.push(e);
    target.set(e.ownerId, list);
  }

  const firstOf = (id: string, type: string) => personEvents.get(id)?.find(e => e.type === type);
  const allOf = (id: string, type: string) => personEvents.get(id)?.filter(e => e.type === type) ?? [];
  const birthYear = (id: string) => firstOf(id, 'BIRT')?.dateYear ?? null;
  const deathYear = (id: string) => firstOf(id, 'DEAT')?.dateYear ?? null;
  const birthDate = (id: string): FullDate | null => parseFullDate(firstOf(id, 'BIRT')?.dateRaw ?? null);
  const name = (id: string) => { const p = byId.get(id); return p ? fullName(p) || id : id; };

  const childrenOf = new Map<string, string[]>();
  for (const l of childLinks) {
    const list = childrenOf.get(l.familyId) ?? [];
    list.push(l.childId);
    childrenOf.set(l.familyId, list);
  }

  for (const p of people) {
    const by = birthYear(p.id);
    const dy = deathYear(p.id);
    const evts = personEvents.get(p.id) ?? [];

    // 1. Födsel efter bortgång
    if (by != null && dy != null && dy < by) {
      add('Födsel efter bortgång', 'error',
        `${name(p.id)} har ett dödsår (${dy}) som ligger före födelseåret (${by}).`, [p.id], [by, dy]);
    }

    // 4/5. Faktum efter döden / före födelsen.
    // Intervalldatum ("BET 1916 AND 1928") krockar bara när HELA spannet
    // ligger på fel sida — annars omsluter perioden födelsen/döden.
    for (const e of evts) {
      const span = yearRange(e.dateRaw);
      if (dy != null && span.start != null && span.start > dy && !POST_MORTEM_OK.has(e.type)) {
        add('Faktum som inträffar efter döden', 'error',
          `${eventLabelSv(e.type)} för ${name(p.id)} (${e.dateRaw}) inträffade efter dödsåret ${dy}.`, [p.id], [e.type, span.start, dy]);
      }
      if (by != null && span.end != null && span.end < by && e.type !== 'BIRT') {
        add('Faktum som inträffar före födelse', 'error',
          `${eventLabelSv(e.type)} för ${name(p.id)} (${e.dateRaw}) inträffade före födelseåret ${by}.`, [p.id], [e.type, span.end, by]);
      }
    }

    // 7/8. Dog för gammal / Vid liv men för gammal
    if (by != null && dy != null && dy - by > MAX_AGE) {
      add('Dog för gammal', 'warning',
        `${name(p.id)} (född ${by}, dog ${dy}) var ${dy - by} år vid sin död.`, [p.id], [by, dy]);
    }
    if (by != null && !firstOf(p.id, 'DEAT') && referenceYear - by > MAX_AGE) {
      add('Vid liv men för gammal', 'warning',
        `${name(p.id)} (född ${by}) är inte markerad som avliden och skulle vara ${referenceYear - by} år gammal.`,
        [p.id], [by]);
    }

    // 15/16. Flera födelse-/dödsfakta
    const births = allOf(p.id, 'BIRT');
    if (births.length > 1) {
      add('Fler födelsefakta för samma person', 'warning',
        `${name(p.id)} har ${births.length} födelsefakta.`, [p.id], [births.length]);
    }
    const deaths = allOf(p.id, 'DEAT');
    if (deaths.length > 1) {
      add('Fler än ett dödsfakta för samma person', 'warning',
        `${name(p.id)} har ${deaths.length} dödsfakta.`, [p.id], [deaths.length]);
    }

    // 17/18/19. Luckor
    if (births.length === 0) {
      add('Saknar födelse', 'warning', `Ingen födelsehändelse registrerad för ${name(p.id)}.`, [p.id], []);
    } else if (!births[0]!.dateRaw) {
      add('Födelse utan datum', 'warning', `Födelsehändelse utan datum för ${name(p.id)}.`, [p.id], []);
    }
    if (deaths.length > 0 && !deaths[0]!.dateRaw) {
      add('Dödsfall utan datum', 'warning', `Dödshändelse utan datum för ${name(p.id)}.`, [p.id], []);
    }

    // 25/26. Namnformat
    const rawName = `${p.givenName} ${p.surname}`;
    if (/\s{2,}/.test(p.givenName) || /\s{2,}/.test(p.surname)) {
      add('Dubbla mellanslag i namnet', 'minor', `Namnet på ${name(p.id)} har dubbla mellanslag.`, [p.id], [rawName]);
    }
    const badCase = rawName.split(/\s+/).some(tok =>
      /[a-zåäöé][A-ZÅÄÖ]/.test(tok) || /^[A-ZÅÄÖ]{2,}[a-zåäöé]/.test(tok));
    if (badCase) {
      add('Inkorrekt användande av stora/små bokstäver', 'minor',
        `Namnet för ${name(p.id)} kan ha felaktigt bruk av stora och små bokstäver.`, [p.id], [rawName]);
    }

    // 27/28. Datum- och platsformat
    for (const e of evts) {
      if (e.dateRaw && /^\s*\d{1,2}\s*$/.test(e.dateRaw)) {
        add('Årtal med två siffror', 'minor',
          `${eventLabelSv(e.type)} för ${name(p.id)} har bara ${e.dateRaw.trim()} som årtal.`, [p.id], [e.type, e.dateRaw]);
      }
      if (e.place && /^\s*\d{1,2}[ .-][A-Za-zÅÄÖåäö]{3,}[ .-]\d{3,4}\s*$/.test(e.place)) {
        add('Platsnamn liknar datum', 'minor',
          `Platsen för ${eventLabelSv(e.type)} ('${e.place}') för ${name(p.id)} liknar ett datum.`, [p.id], [e.type, e.place]);
      }
    }
  }

  // ---- familjebaserade regler ----
  for (const f of fams) {
    const kids = (childrenOf.get(f.id) ?? []).filter(id => byId.has(id));
    const parents = [f.husbandId, f.wifeId].filter((x): x is string => !!x && byId.has(x));

    for (const parentId of parents) {
      const pby = birthYear(parentId);
      const pdy = deathYear(parentId);
      const isFather = f.husbandId === parentId;
      for (const childId of kids) {
        const cby = birthYear(childId);
        if (cby == null) continue;

        // 2. Barnet äldre än föräldrarna
        if (pby != null && cby <= pby) {
          add('Barnet äldre än föräldrarna', 'error',
            `${name(childId)} (född ${cby}) är äldre än eller lika gammal som sin ${isFather ? 'far' : 'mor'} ${name(parentId)} (född ${pby}).`,
            [childId, parentId], [cby, pby]);
        }
        // 3. Barn fött efter förälders bortgång (fadern får ett års nåd)
        if (pdy != null && cby > pdy + (isFather ? 1 : 0)) {
          add('Barn fött efter förälders bortgång', 'error',
            `${name(childId)} föddes ${cby}, efter ${isFather ? 'faderns' : 'moderns'} ${name(parentId)} död ${pdy}.`,
            [childId, parentId], [cby, pdy]);
        }
        // 9/10. Föräldraålder
        if (pby != null) {
          const gap = cby - pby;
          if (gap > 0 && gap <= PARENT_MIN_GAP) {
            add('Föräldrar för unga när de fick barn', 'warning',
              `${name(parentId)} var bara ${gap} år när ${name(childId)} föddes (${cby}).`,
              [parentId, childId], [gap, cby]);
          } else if (gap >= PARENT_MAX_GAP) {
            add('Förälder för gammal när man fått barn', 'warning',
              `${name(parentId)} var ${gap} år när ${name(childId)} föddes (${cby}).`,
              [parentId, childId], [gap, cby]);
          }
        }
      }
    }

    // 11. Syskon med nära ålder (tvillingar undantagna)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = birthDate(kids[i]!);
        const b = birthDate(kids[j]!);
        if (!a || !b) continue;
        const days = daysBetween(a, b);
        if (days > 0 && days < SIBLING_MIN_DAYS) {
          add('Syskon med nära ålder', 'warning',
            `${name(kids[i]!)} och ${name(kids[j]!)} är födda bara ${days} dagar isär.`,
            [kids[i]!, kids[j]!], [days]);
        }
      }
    }

    // 22. Syskon med samma förnamn. Att återanvända ett avlidet syskons namn
    // var vanligt historiskt — flagga bara när båda levde samtidigt.
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = byId.get(kids[i]!)!;
        const b = byId.get(kids[j]!)!;
        const given = normalizeName(a.givenName);
        if (!given || given !== normalizeName(b.givenName)) continue;
        const [aBirth, bBirth] = [birthYear(a.id), birthYear(b.id)];
        const [aDeath, bDeath] = [deathYear(a.id), deathYear(b.id)];
        const nameReuse =
          (aDeath != null && bBirth != null && aDeath <= bBirth) ||
          (bDeath != null && aBirth != null && bDeath <= aBirth);
        if (nameReuse) continue;
        for (const [self, other] of [[a.id, b.id], [b.id, a.id]] as const) {
          add('Syskon med samma förnamn', 'info',
            `${name(self)} delar förnamn med sitt syskon ${name(other)}.`, [self, other], [given]);
        }
      }
    }

    // 12/13/14/20/21. Par- och äktenskapsregler
    const marriages = (familyEvents.get(f.id) ?? []).filter(e => e.type === 'MARR');
    if (marriages.length > 1) {
      add('Flera äktenskap för samma par', 'info',
        `${parents.map(name).join(' och ')} har ${marriages.length} äktenskapsfakta.`,
        parents.length ? parents : [f.id], [marriages.length]);
    }
    if (f.husbandId && f.wifeId && byId.has(f.husbandId) && byId.has(f.wifeId)) {
      const hby = birthYear(f.husbandId);
      const wby = birthYear(f.wifeId);
      if (hby != null && wby != null && Math.abs(hby - wby) >= SPOUSE_MAX_GAP) {
        add('Stor åldersskillnad mellan makar', 'warning',
          `${name(f.husbandId)} (född ${hby}) och ${name(f.wifeId)} (född ${wby}) har ${Math.abs(hby - wby)} år emellan sig.`,
          [f.husbandId, f.wifeId], [Math.abs(hby - wby)]);
      }
      const husband = byId.get(f.husbandId)!;
      const wife = byId.get(f.wifeId)!;
      if (husband.surname.trim() && normalizeName(husband.surname) === normalizeName(wife.surname)) {
        add('Namn som gift inlagt som födelseefternamn', 'info',
          `Födelseefternamnet '${wife.surname}' för ${name(f.wifeId)} är samma som makens ${name(f.husbandId)}.`,
          [f.wifeId, f.husbandId], [wife.surname]);
      }
    }
    const marrYear = marriages.find(m => m.dateYear != null)?.dateYear ?? null;
    for (const spouseId of parents) {
      const sby = birthYear(spouseId);
      const sdy = deathYear(spouseId);
      if (marrYear != null && sby != null && marrYear - sby < MARRY_MIN_AGE && marrYear >= sby) {
        add('Gift för ung', 'warning',
          `${name(spouseId)} var bara ${marrYear - sby} år vid giftermålet ${marrYear}.`,
          [spouseId], [marrYear, sby]);
      }
      if (marriages.length > 0 && sby != null && sdy != null && sdy - sby < MARRIED_MIN_DEATH_AGE) {
        add('Dog för ung för att vara gift', 'warning',
          `${name(spouseId)} (född ${sby}, dog ${sdy}) var bara ${sdy - sby} år vid sin död men är registrerad som gift.`,
          [spouseId], [sby, sdy]);
      }
    }
  }

  // ---- 23/24. Stavningsvarianter ----
  const spellingIssues = (
    values: { id: string; value: string; label: string }[],
    category: string,
    describe: (owner: string, rare: string, common: string, n: number) => string,
  ) => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
    const common = [...counts.entries()].filter(([, n]) => n >= SPELLING_COMMON_MIN);
    const seen = new Set<string>();
    for (const v of values) {
      if ((counts.get(v.value) ?? 0) > SPELLING_RARE_MAX) continue;
      const key = `${v.id}|${v.value}`;
      if (seen.has(key)) continue;
      const match = common.find(([c]) => c !== v.value && editDistance(c.toLowerCase(), v.value.toLowerCase(), 1) <= 1);
      if (!match) continue;
      seen.add(key);
      add(category, 'info', describe(name(v.id), v.value, match[0], match[1]), [v.id], [v.value, match[0]]);
    }
  };

  spellingIssues(
    people.filter(p => p.surname.trim()).map(p => ({ id: p.id, value: p.surname.trim(), label: 'efternamn' })),
    'Möjlig inkonsekvent stavning av efternamn',
    (owner, rare, common, n) => `${owner} har efternamnet '${rare}' som förekommer en gång, medan '${common}' förekommer ${n} gånger.`,
  );
  spellingIssues(
    allEvents.filter(e => e.ownerType === 'person' && e.place?.trim() && byId.has(e.ownerId))
      .map(e => ({ id: e.ownerId, value: e.place!.trim(), label: 'plats' })),
    'Möjlig inkonsekvent stavning av platsnamn',
    (owner, rare, common, n) => `${owner} har platsen '${rare}' som förekommer en gång, medan '${common}' förekommer ${n} gånger.`,
  );

  // ---- 6. Möjliga dubbletter ----
  const parentsOf = new Map<string, string[]>();
  for (const l of childLinks) {
    const f = fams.find(x => x.id === l.familyId);
    if (!f) continue;
    parentsOf.set(l.childId, [f.husbandId, f.wifeId].filter((x): x is string => !!x).sort());
  }
  const groups = new Map<string, string[]>();
  for (const p of people) {
    const by = birthYear(p.id);
    if (by == null) continue;
    const key = `${normalizeName(fullName(p))}|${by}`;
    if (!normalizeName(fullName(p))) continue;
    const list = groups.get(key) ?? [];
    list.push(p.id);
    groups.set(key, list);
  }
  for (const [key, ids] of groups) {
    if (ids.length < 2) continue;
    const [nameKey, yearKey] = key.split('|');
    const parentSets = ids.map(id => (parentsOf.get(id) ?? []).join(','));
    const confidence: 'high' | 'review' =
      parentSets[0] !== '' && parentSets.every(s => s === parentSets[0]) ? 'high' : 'review';
    const group: DuplicateGroup = { name: byId.get(ids[0]!)! && fullName(byId.get(ids[0]!)!), year: Number(yearKey), confidence, ids: [...ids].sort() };
    for (const id of ids) {
      add('Möjlig dubblett', 'dup',
        `Samma namn och födelseår (${yearKey}) som ${ids.length - 1} annan post. Säkerhet: ${confidence === 'high' ? 'hög (samma föräldrar)' : 'kräver bedömning'}.`,
        [id, ...ids.filter(o => o !== id)], [nameKey!, yearKey!, confidence], group);
    }
  }

  return issues.sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    || a.category.localeCompare(b.category, 'sv')
    || a.personIds[0]!.localeCompare(b.personIds[0]!));
}
