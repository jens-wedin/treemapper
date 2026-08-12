import {
  MONTH_TAGS, parseGedcomDate, toGedcom,
  type DateParts, type GedcomDate, type Qualifier,
} from '../../lib/gedcomDate';

/**
 * The bridge between a stored GEDCOM date and the boxes on the screen.
 *
 * Kept out of the component so it can be tested directly — the component is
 * then thin enough that its own behaviour is a question for the e2e suite.
 * Everything here is strings, because that is what an `<input>` holds.
 */
export interface DateFieldState {
  qualifier: Qualifier;
  fromDay: string; fromMonth: string; fromYear: string;
  toDay: string; toMonth: string; toYear: string;
  /** A date the form cannot represent, kept exactly as written. */
  text: string;
}

export const blankDateField: DateFieldState = {
  qualifier: 'exact',
  fromDay: '', fromMonth: '', fromYear: '',
  toDay: '', toMonth: '', toYear: '',
  text: '',
};

/** Qualifiers that reveal a second row of date parts. */
export const RANGE_QUALIFIERS: Qualifier[] = ['between', 'period'];

const str = (n: number | null): string => (n === null ? '' : String(n));
const num = (s: string): number | null => {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const partsOf = (day: string, month: string, year: string): DateParts =>
  ({ day: num(day), month: num(month), year: num(year) });

/**
 * Why the boxes do not yet make a date, as a dictionary key — or null.
 *
 * The whole point of the structured control is that a malformed date cannot be
 * entered, and without this it could: nothing stopped `45 MAR 1902`, `0 MAR
 * 1902` or `31 FEB 1902` being written straight into `date_raw`.
 */
export function dateFieldError(state: DateFieldState): string | null {
  if (state.text.trim()) return null;   // kept as written, on purpose

  for (const [day, month, year] of [
    [state.fromDay, state.fromMonth, state.fromYear],
    [state.toDay, state.toMonth, state.toYear],
  ] as const) {
    const d = num(day);
    const m = num(month);
    const y = num(year);
    if (d === null && m === null && y === null) continue;
    if (y === null) return 'edit.dateNeedsYear';
    if (d !== null && m === null) return 'edit.dateNeedsMonth';
    if (d !== null && m !== null && !parseGedcomDate(`${d} ${MONTH_TAGS[m - 1]} ${y}`)) {
      return 'edit.dateNoSuchDay';
    }
  }
  return null;
}

/** What is stored → what the boxes should show. Unmodellable text goes to the text box. */
export function fromRaw(raw: string | null | undefined): DateFieldState {
  if (!raw?.trim()) return { ...blankDateField };
  const date = parseGedcomDate(raw);
  if (!date) return { ...blankDateField, text: raw };
  return {
    qualifier: date.qualifier,
    fromDay: str(date.from.day), fromMonth: str(date.from.month), fromYear: str(date.from.year),
    toDay: str(date.to?.day ?? null), toMonth: str(date.to?.month ?? null), toYear: str(date.to?.year ?? null),
    text: '',
  };
}

/** What the boxes hold → what to store. Empty when there is no date to write. */
export function toRaw(state: DateFieldState): string {
  if (state.text.trim()) return state.text;
  // An impossible date stores nothing rather than something broken; the form
  // says why and refuses to save, so nothing is lost silently.
  if (dateFieldError(state)) return '';

  const from = partsOf(state.fromDay, state.fromMonth, state.fromYear);
  const to = partsOf(state.toDay, state.toMonth, state.toYear);
  const hasFrom = from.year !== null;
  const hasTo = to.year !== null;
  if (!hasFrom && !hasTo) return '';

  let date: GedcomDate;
  if (state.qualifier === 'between') {
    // Half a range is a weaker claim, not a broken one: "between 1916 and ?"
    // is "after 1916". Writing "BET 1916 AND " would be neither.
    if (hasFrom && hasTo) date = { qualifier: 'between', from, to };
    else if (hasFrom) date = { qualifier: 'after', from, to: null };
    else date = { qualifier: 'before', from: to, to: null };
  } else if (state.qualifier === 'period') {
    // GEDCOM lets a period stay open at either end, so both halves are kept.
    date = { qualifier: 'period', from: hasFrom ? from : { day: null, month: null, year: null }, to: hasTo ? to : null };
  } else {
    if (!hasFrom) return '';
    date = { qualifier: state.qualifier, from, to: null };
  }

  return toGedcom(date);
}
