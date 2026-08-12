import { looksLikeGedcom, parseGedcomDate, toGedcom } from './gedcomDate';

/**
 * What, if anything, should be done to one event's date.
 *
 * Pure and event-shaped rather than row-shaped, so the decisions can be read in
 * a test instead of only in a dry run. `scripts/normalise-dates.ts` applies
 * whatever this returns; nothing else decides anything.
 */
export type FixReason =
  | 'normalise'              // already a date, written the long way round
  | 'century'                // "17xx" names a hundred years
  | 'period-end-is-before'   // "TO 1803" on a death is a death before 1803
  | 'residence-period'       // BET is an uncertain date; a residence is a period
  | 'placeholder'            // "-", "0", "Unknown": nothing to keep
  | 'rescue-to-description'; // not a date, but it says something

export interface EventDateFields {
  type: string;
  dateRaw: string | null;
  description: string | null;
  place: string | null;
}

export interface DateFix {
  reason: FixReason;
  dateRaw: string | null;
  description: string | null;
  place: string | null;
}

/** "17xx", "17..", "16..." — a century, however it was abbreviated. */
const CENTURY = /^(\d{2})(?:xx|\.{2,})$/i;

/** Text that stands in for a date without being one. Nothing is lost by dropping it. */
const PLACEHOLDERS = new Set(['-', '--', '0', 'UNKNOWN', 'OKÄNT', 'OKAND', 'OKÄND', '?', 'N/A']);

/** Events where a period ending at a date really means the date is an upper bound. */
const MOMENTS = new Set(['DEAT', 'BURI', 'BIRT', 'CHR', 'BAPM']);

/** Events that last, so a range across years is a period rather than uncertainty. */
const SPANS = new Set(['RESI', 'OCCU', 'EDUC']);

/**
 * GEDCOM writes "1 DEAT Y" to assert an event happened; the Y is a flag, so it
 * must not be treated as an existing description worth keeping.
 */
const realDescription = (d: string | null): string | null =>
  !d || d.trim() === 'Y' ? null : d;

const rescue = (e: EventDateFields, text: string): DateFix => {
  const existing = realDescription(e.description);
  return {
    reason: 'rescue-to-description',
    dateRaw: null,
    description: existing ? `${existing} — ${text}` : text,
    place: e.place,
  };
};

/** null when there is nothing to do. */
export function planDateFix(e: EventDateFields): DateFix | null {
  const raw = e.dateRaw?.trim();
  if (!raw) return null;

  // Before anything else: "0" is digits, and would otherwise read as GEDCOM.
  if (PLACEHOLDERS.has(raw.toUpperCase())) {
    return { reason: 'placeholder', dateRaw: null, description: e.description, place: e.place };
  }

  // Valid GEDCOM the model cannot hold — a qualifier nested inside a range.
  // Seven rows, and rewriting any of them would narrow what they claim.
  if (!parseGedcomDate(raw) && looksLikeGedcom(raw)) return null;

  const parsed = parseGedcomDate(raw);

  if (parsed) {
    // A death "TO 1803" is a death before 1803; an occupation "TO 1965" is not.
    if (parsed.qualifier === 'period' && parsed.from.year === null && parsed.to && MOMENTS.has(e.type)) {
      return {
        reason: 'period-end-is-before',
        dateRaw: toGedcom({ qualifier: 'before', from: parsed.to, to: null }),
        description: e.description,
        place: e.place,
      };
    }

    // MyHeritage exported a lived-in span as an uncertain single date.
    if (parsed.qualifier === 'between' && SPANS.has(e.type)) {
      return {
        reason: 'residence-period',
        dateRaw: toGedcom({ qualifier: 'period', from: parsed.from, to: parsed.to }),
        description: e.description,
        place: e.place,
      };
    }

    const canonical = toGedcom(parsed);
    if (canonical === raw) return null;
    return { reason: 'normalise', dateRaw: canonical, description: e.description, place: e.place };
  }

  const century = CENTURY.exec(raw);
  if (century) {
    const start = Number(century[1]) * 100;
    return {
      reason: 'century',
      dateRaw: `BET ${start} AND ${start + 99}`,
      description: e.description,
      place: e.place,
    };
  }

  // Everything else says something — an age at death, an ambiguity, a time of
  // day, one parish. It all moves to the description: `INFANT` and `arbrå` are
  // the same shape, so any rule that sorted one into the place column would be
  // guessing. The dry run lists each of them, and moving one by hand afterwards
  // takes a moment.
  return rescue(e, raw);
}
