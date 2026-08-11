import { createHash } from 'node:crypto';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events } from '../db/schema';
import { parseFullDate, daysBetween, yearRange, type FullDate } from './dates';

export type Severity = 'error' | 'dup' | 'warning' | 'info' | 'minor';
export const SEVERITY_ORDER: Severity[] = ['error', 'dup', 'warning', 'info', 'minor'];

export interface DuplicateGroup {
  name: string;
  year: number | null;
  confidence: 'high' | 'review';
  ids: string[];
}

/**
 * What kind of problem this is.
 *
 * A stable identifier rather than a sentence. The detector used to emit the
 * Swedish wording itself, which made the queue Swedish however the app was
 * set — and made the dismissal fingerprint depend on the phrasing, so
 * rewording a message would have quietly un-dismissed everything it named.
 */
export type IssueCode =
  | 'death-before-birth'
  | 'fact-after-death'
  | 'fact-before-birth'
  | 'died-too-old'
  | 'alive-too-old'
  | 'multiple-births'
  | 'multiple-deaths'
  | 'missing-birth'
  | 'birth-without-date'
  | 'death-without-date'
  | 'double-space-in-name'
  | 'odd-capitalisation'
  | 'two-digit-year'
  | 'place-looks-like-date'
  | 'child-older-than-parents'
  | 'child-born-after-parent-died'
  | 'parents-too-young'
  | 'parent-too-old'
  | 'siblings-born-too-close'
  | 'siblings-share-given-name'
  | 'duplicate-marriage'
  | 'large-spouse-age-gap'
  | 'married-name-as-surname'
  | 'married-too-young'
  | 'died-too-young-to-marry'
  | 'inconsistent-surname-spelling'
  | 'inconsistent-place-spelling'
  | 'possible-duplicate';

/** Every code, for the queue's filter and for a test that keeps it honest. */
export const ISSUE_CODES: IssueCode[] = [
  'death-before-birth', 'fact-after-death', 'fact-before-birth', 'died-too-old',
  'alive-too-old', 'multiple-births', 'multiple-deaths', 'missing-birth',
  'birth-without-date', 'death-without-date', 'double-space-in-name', 'odd-capitalisation',
  'two-digit-year', 'place-looks-like-date', 'child-older-than-parents',
  'child-born-after-parent-died', 'parents-too-young', 'parent-too-old',
  'siblings-born-too-close', 'siblings-share-given-name', 'duplicate-marriage',
  'large-spouse-age-gap', 'married-name-as-surname', 'married-too-young',
  'died-too-young-to-marry', 'inconsistent-surname-spelling', 'inconsistent-place-spelling',
  'possible-duplicate',
];

/**
 * The values the sentence is built from.
 *
 * Two of these keys are themselves translated rather than printed: `event` is
 * a GEDCOM tag (`BIRT`), and `role` is `father` or `mother`. The server has no
 * business knowing what those are called in the reader's language.
 */
export type IssueParams = Record<string, string | number>;

export interface Issue {
  fingerprint: string;
  code: IssueCode;
  severity: Severity;
  params: IssueParams;
  /** Everyone involved; [0] owns the queue entry. */
  personIds: string[];
  duplicateGroup?: DuplicateGroup;
}

export interface DetectOptions { referenceYear?: number }

/** One problem as the tree shows it — the queue's own wording, per person. */
export interface PersonProblem {
  severity: Severity;
  code: IssueCode;
  params: IssueParams;
}

/** What the tree charts draw on a card to say "look here". */
export interface PersonIssueMark {
  /** The worst of them — the badge takes its colour from this. */
  severity: Severity;
  /** Worst first; the badge counts them, the person panel reads them out. */
  problems: PersonProblem[];
}

/**
 * Folds a list of issues into one entry per person involved. Everyone named
 * is marked, not just `personIds[0]`: a child born after its father died is
 * worth spotting from either card.
 */
export function summarizeByPerson(issues: Issue[]): Record<string, PersonIssueMark> {
  const worstFirst = [...issues].sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const marks: Record<string, PersonIssueMark> = {};
  for (const { severity, code, params, personIds } of worstFirst) {
    for (const id of personIds) {
      const mark = marks[id] ?? (marks[id] = { severity, problems: [] });
      mark.problems.push({ severity, code, params });
    }
  }
  return marks;
}

// Thresholds calibrated against MyHeritage's own "Konsekvenskontroll av träd"
// (data/konsekvensproblem.pdf, 2026-07-09, 894 problems / 24 categories).
const MAX_AGE = 110;              // alive / died too old
const PARENT_MIN_GAP = 15;        // parents too young (15 years or less between)
const PARENT_MAX_GAP = 65;        // parent too old (65 years or more between)
const SIBLING_MIN_DAYS = 300;     // siblings born close (< 300 days, twins excepted)
const SPOUSE_MAX_GAP = 35;        // large age gap between spouses
const MARRY_MIN_AGE = 16;         // married too young
const MARRIED_MIN_DEATH_AGE = 14; // died too young to have married
const SPELLING_RARE_MAX = 1;      // a spelling variant occurring at most once …
const SPELLING_COMMON_MIN = 3;    // … against one occurring at least 3 times

/** MyHeritage placeholder record, not a real person. */
const SENTINEL_ID = 'I88888888';

// Events that legitimately happen after death.
const POST_MORTEM_OK = new Set(['DEAT', 'BURI', 'CREM', 'PROB', 'WILL']);

/**
 * What makes two reports of a problem the same problem, across runs.
 *
 * Built from the code rather than the wording, so a message can be rephrased —
 * or translated — without losing the dismissals that named it.
 */
const fingerprint = (code: string, ids: string[], ...values: (string | number | null)[]) =>
  createHash('sha1')
    .update([code, [...ids].sort().join(','), values.map(v => v ?? '').join('|')].join('§'))
    .digest('hex')
    .slice(0, 16);

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const fullName = (p: { givenName: string; surname: string }) =>
  [p.givenName, p.surname].filter(s => s.trim()).join(' ').replace(/\s+/g, ' ').trim();

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
    code: IssueCode, severity: Severity, params: IssueParams, personIds: string[],
    values: (string | number | null)[], duplicateGroup?: DuplicateGroup,
  ) => {
    issues.push({ fingerprint: fingerprint(code, personIds, ...values), code, severity, params, personIds, ...(duplicateGroup ? { duplicateGroup } : {}) });
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

    // 1. Death before birth
    if (by != null && dy != null && dy < by) {
      add('death-before-birth', 'error',
        { name: name(p.id), death: dy, birth: by }, [p.id], [by, dy]);
    }

    // 4/5. A fact after death / before birth.
    // A range ("BET 1916 AND 1928") only clashes when the WHOLE span falls on
    // the wrong side — otherwise the period encloses the birth or the death.
    for (const e of evts) {
      const span = yearRange(e.dateRaw);
      if (dy != null && span.start != null && span.start > dy && !POST_MORTEM_OK.has(e.type)) {
        add('fact-after-death', 'error',
          { event: e.type, name: name(p.id), date: e.dateRaw ?? '', year: dy },
          [p.id], [e.type, span.start, dy]);
      }
      if (by != null && span.end != null && span.end < by && e.type !== 'BIRT') {
        add('fact-before-birth', 'error',
          { event: e.type, name: name(p.id), date: e.dateRaw ?? '', year: by },
          [p.id], [e.type, span.end, by]);
      }
    }

    // 7/8. Died too old / alive but too old
    if (by != null && dy != null && dy - by > MAX_AGE) {
      add('died-too-old', 'warning',
        { name: name(p.id), birth: by, death: dy, age: dy - by }, [p.id], [by, dy]);
    }
    if (by != null && !firstOf(p.id, 'DEAT') && referenceYear - by > MAX_AGE) {
      add('alive-too-old', 'warning',
        { name: name(p.id), birth: by, age: referenceYear - by }, [p.id], [by]);
    }

    // 15/16. More than one birth or death fact
    const births = allOf(p.id, 'BIRT');
    if (births.length > 1) {
      add('multiple-births', 'warning',
        { name: name(p.id), count: births.length }, [p.id], [births.length]);
    }
    const deaths = allOf(p.id, 'DEAT');
    if (deaths.length > 1) {
      add('multiple-deaths', 'warning',
        { name: name(p.id), count: deaths.length }, [p.id], [deaths.length]);
    }

    // 17/18/19. Gaps
    if (births.length === 0) {
      add('missing-birth', 'warning', { name: name(p.id) }, [p.id], []);
    } else if (!births[0]!.dateRaw) {
      add('birth-without-date', 'warning', { name: name(p.id) }, [p.id], []);
    }
    if (deaths.length > 0 && !deaths[0]!.dateRaw) {
      add('death-without-date', 'warning', { name: name(p.id) }, [p.id], []);
    }

    // 25/26. Name formatting
    const rawName = `${p.givenName} ${p.surname}`;
    if (/\s{2,}/.test(p.givenName) || /\s{2,}/.test(p.surname)) {
      add('double-space-in-name', 'minor', { name: name(p.id) }, [p.id], [rawName]);
    }
    const badCase = rawName.split(/\s+/).some(tok =>
      /[a-zåäöé][A-ZÅÄÖ]/.test(tok) || /^[A-ZÅÄÖ]{2,}[a-zåäöé]/.test(tok));
    if (badCase) {
      add('odd-capitalisation', 'minor', { name: name(p.id) }, [p.id], [rawName]);
    }

    // 27/28. Date and place formatting
    for (const e of evts) {
      if (e.dateRaw && /^\s*\d{1,2}\s*$/.test(e.dateRaw)) {
        add('two-digit-year', 'minor',
          { event: e.type, name: name(p.id), year: e.dateRaw.trim() }, [p.id], [e.type, e.dateRaw]);
      }
      if (e.place && /^\s*\d{1,2}[ .-][A-Za-zÅÄÖåäö]{3,}[ .-]\d{3,4}\s*$/.test(e.place)) {
        add('place-looks-like-date', 'minor',
          { event: e.type, place: e.place, name: name(p.id) }, [p.id], [e.type, e.place]);
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

        // 2. Child older than its parents
        if (pby != null && cby <= pby) {
          add('child-older-than-parents', 'error',
            {
              child: name(childId), childBirth: cby, role: isFather ? 'father' : 'mother',
              parent: name(parentId), parentBirth: pby,
            },
            [childId, parentId], [cby, pby]);
        }
        // 3. Child born after a parent died (the father gets a year's grace)
        if (pdy != null && cby > pdy + (isFather ? 1 : 0)) {
          add('child-born-after-parent-died', 'error',
            {
              child: name(childId), childBirth: cby, role: isFather ? 'father' : 'mother',
              parent: name(parentId), parentDeath: pdy,
            },
            [childId, parentId], [cby, pdy]);
        }
        // 9/10. Parent age
        if (pby != null) {
          const gap = cby - pby;
          if (gap > 0 && gap <= PARENT_MIN_GAP) {
            add('parents-too-young', 'warning',
              { parent: name(parentId), age: gap, child: name(childId), childBirth: cby },
              [parentId, childId], [gap, cby]);
          } else if (gap >= PARENT_MAX_GAP) {
            add('parent-too-old', 'warning',
              { parent: name(parentId), age: gap, child: name(childId), childBirth: cby },
              [parentId, childId], [gap, cby]);
          }
        }
      }
    }

    // 11. Siblings born too close together (twins excepted)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = birthDate(kids[i]!);
        const b = birthDate(kids[j]!);
        if (!a || !b) continue;
        const days = daysBetween(a, b);
        if (days > 0 && days < SIBLING_MIN_DAYS) {
          add('siblings-born-too-close', 'warning',
            { a: name(kids[i]!), b: name(kids[j]!), days },
            [kids[i]!, kids[j]!], [days]);
        }
      }
    }

    // 22. Siblings sharing a given name. Reusing a dead sibling's name was
    // common historically — only flag it when both were alive at once.
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
          add('siblings-share-given-name', 'info',
            { name: name(self), sibling: name(other) }, [self, other], [given]);
        }
      }
    }

    // 12/13/14/20/21. Couple and marriage rules
    const marriages = (familyEvents.get(f.id) ?? []).filter(e => e.type === 'MARR');
    if (marriages.length > 1) {
      add('duplicate-marriage', 'info',
        { couple: parents.map(name).join(' & '), count: marriages.length },
        parents.length ? parents : [f.id], [marriages.length]);
    }
    if (f.husbandId && f.wifeId && byId.has(f.husbandId) && byId.has(f.wifeId)) {
      const hby = birthYear(f.husbandId);
      const wby = birthYear(f.wifeId);
      if (hby != null && wby != null && Math.abs(hby - wby) >= SPOUSE_MAX_GAP) {
        add('large-spouse-age-gap', 'warning',
          {
            husband: name(f.husbandId), husbandBirth: hby,
            wife: name(f.wifeId), wifeBirth: wby, gap: Math.abs(hby - wby),
          },
          [f.husbandId, f.wifeId], [Math.abs(hby - wby)]);
      }
      const husband = byId.get(f.husbandId)!;
      const wife = byId.get(f.wifeId)!;
      if (husband.surname.trim() && normalizeName(husband.surname) === normalizeName(wife.surname)) {
        add('married-name-as-surname', 'info',
          { surname: wife.surname, wife: name(f.wifeId), husband: name(f.husbandId) },
          [f.wifeId, f.husbandId], [wife.surname]);
      }
    }
    const marrYear = marriages.find(m => m.dateYear != null)?.dateYear ?? null;
    for (const spouseId of parents) {
      const sby = birthYear(spouseId);
      const sdy = deathYear(spouseId);
      if (marrYear != null && sby != null && marrYear - sby < MARRY_MIN_AGE && marrYear >= sby) {
        add('married-too-young', 'warning',
          { name: name(spouseId), age: marrYear - sby, year: marrYear },
          [spouseId], [marrYear, sby]);
      }
      if (marriages.length > 0 && sby != null && sdy != null && sdy - sby < MARRIED_MIN_DEATH_AGE) {
        add('died-too-young-to-marry', 'warning',
          { name: name(spouseId), birth: sby, death: sdy, age: sdy - sby },
          [spouseId], [sby, sdy]);
      }
    }
  }

  // ---- 23/24. Spelling variants ----
  const spellingIssues = (
    values: { id: string; value: string }[],
    code: IssueCode,
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
      add(code, 'info',
        { name: name(v.id), rare: v.value, common: match[0], count: match[1] },
        [v.id], [v.value, match[0]]);
    }
  };

  spellingIssues(
    people.filter(p => p.surname.trim()).map(p => ({ id: p.id, value: p.surname.trim() })),
    'inconsistent-surname-spelling',
  );
  spellingIssues(
    allEvents.filter(e => e.ownerType === 'person' && e.place?.trim() && byId.has(e.ownerId))
      .map(e => ({ id: e.ownerId, value: e.place!.trim() })),
    'inconsistent-place-spelling',
  );

  // ---- 6. Possible duplicates ----
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
      add('possible-duplicate', 'dup',
        { year: yearKey!, others: ids.length - 1, confidence },
        [id, ...ids.filter(o => o !== id)], [nameKey!, yearKey!, confidence], group);
    }
  }

  // Two issues with the same fingerprint *and* the same owner are the same
  // problem said twice — the data holds duplicate facts (four identical
  // residences, say), and each of them raised its own flag. Reporting it once
  // is what the queue means, and it keeps every card's key unique. The owner
  // has to be part of the identity: a duplicate group shares one fingerprint
  // across its members on purpose, and each of them still needs its own card.
  const seen = new Set<string>();
  const distinct = issues.filter(i => {
    const key = `${i.fingerprint}|${i.personIds[0]}`;
    return !seen.has(key) && (seen.add(key), true);
  });

  // Sorted by code, not by the wording: the server has no language to sort in.
  // The queue groups by severity and orders those groups by the translated
  // title, which is the order that means something on screen.
  return distinct.sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    || a.code.localeCompare(b.code)
    || a.personIds[0]!.localeCompare(b.personIds[0]!));
}
