/**
 * The one place that reads and writes a GEDCOM date.
 *
 * `events.date_raw` is the source of truth and holds canonical GEDCOM; nothing
 * structured is stored beside it, because two representations of one date can
 * disagree and the text is what has to survive an export round-trip. Everything
 * here is derived on read.
 *
 * The parser is deliberately more generous than the writer: it accepts what a
 * person might type and what MyHeritage might have exported, and `toGedcom`
 * emits exactly one shape.
 */

export type Qualifier =
  | 'exact' | 'about' | 'before' | 'after'
  | 'between' | 'period' | 'estimated' | 'calculated';

/** Any part may be null: "MAR 1902" is a real date, and so is "1821". */
export interface DateParts { day: number | null; month: number | null; year: number | null }

export interface GedcomDate {
  qualifier: Qualifier;
  from: DateParts;
  /** Only for 'between' and 'period'; null otherwise. */
  to: DateParts | null;
}

export const MONTH_TAGS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/**
 * Month names in the four languages the app speaks, long and short, because
 * this has to read what is already in the databases and what someone types into
 * the escape hatch. The writer only ever emits the GEDCOM tag.
 */
const MONTH_WORDS: string[][] = [
  ['JAN', 'JANUARY', 'JANUARI', 'JANUAR', 'ENERO', 'ENE'],
  ['FEB', 'FEBRUARY', 'FEBRUARI', 'FEBRUAR', 'FEBRERO'],
  ['MAR', 'MARCH', 'MARS', 'MÄRZ', 'MAERZ', 'MARZO'],
  ['APR', 'APRIL', 'ABRIL', 'ABR'],
  ['MAY', 'MAJ', 'MAI', 'MAYO'],
  ['JUN', 'JUNE', 'JUNI', 'JUNIO'],
  ['JUL', 'JULY', 'JULI', 'JULIO'],
  ['AUG', 'AUGUST', 'AUGUSTI', 'AGOSTO', 'AGO'],
  ['SEP', 'SEPT', 'SEPTEMBER', 'SEPTIEMBRE', 'SEPTIEMBRE', 'SET'],
  ['OCT', 'OCTOBER', 'OKTOBER', 'OKT', 'OCTUBRE'],
  ['NOV', 'NOVEMBER', 'NOVIEMBRE'],
  ['DEC', 'DECEMBER', 'DEZEMBER', 'DEZ', 'DICIEMBRE', 'DIC'],
];

const MONTH_BY_WORD = new Map<string, number>(
  MONTH_WORDS.flatMap((words, i) => words.map(word => [word, i + 1] as [string, number])),
);

/** 1–12, or null when the token is not a month in any language the app speaks. */
function monthNumber(token: string): number | null {
  return MONTH_BY_WORD.get(token.toUpperCase().replace(/\.$/, '')) ?? null;
}

/** Day/month/year in any order the tokens allow. Null when a token is not a date part. */
function parseParts(text: string): DateParts | null {
  // ISO, because people paste it out of a spreadsheet or a birth register.
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text.trim());
  if (iso) {
    const month = Number(iso[2]);
    const day = iso[3] === undefined ? null : Number(iso[3]);
    if (month < 1 || month > 12 || (day !== null && (day < 1 || day > 31))) return null;
    return { day, month, year: Number(iso[1]) };
  }

  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (const token of tokens) {
    const asMonth = monthNumber(token);
    if (asMonth !== null) {
      if (month !== null) return null;
      month = asMonth;
      continue;
    }
    if (/^\d{1,2}$/.test(token)) {
      if (day !== null) return null;
      const n = Number(token);
      if (n < 1 || n > 31) return null;
      day = n;
      continue;
    }
    if (/^\d{3,4}$/.test(token)) {
      if (year !== null) return null;
      year = Number(token);
      continue;
    }
    return null;
  }

  // A day with no month is not a date anyone can place; a year is the minimum.
  if (year === null || (day !== null && month === null)) return null;
  return { day, month, year };
}

const EMPTY: DateParts = { day: null, month: null, year: null };

const TAG: Record<Qualifier, string> = {
  exact: '', about: 'ABT', estimated: 'EST', calculated: 'CAL',
  before: 'BEF', after: 'AFT', between: 'BET', period: 'FROM',
};

/** "17 MAR 1942" · "MAR 1942" · "1942" · "" when there is nothing to say. */
function writeParts({ day, month, year }: DateParts): string {
  if (year === null) return '';
  // A day without a month cannot be placed in the year, so it is not written.
  if (month === null) return String(year);
  const tag = MONTH_TAGS[month - 1]!;
  return day === null ? `${tag} ${year}` : `${day} ${tag} ${year}`;
}

/** Canonical GEDCOM 5.5.1. The only writer of `date_raw`. */
export function toGedcom(date: GedcomDate): string {
  const from = writeParts(date.from);
  const to = date.to ? writeParts(date.to) : '';

  if (date.qualifier === 'between') return `BET ${from} AND ${to}`;
  if (date.qualifier === 'period') {
    if (from && to) return `FROM ${from} TO ${to}`;
    return from ? `FROM ${from}` : `TO ${to}`;
  }
  return date.qualifier === 'exact' ? from : `${TAG[date.qualifier]} ${from}`;
}

const PREFIX: Record<string, Qualifier> = {
  ABT: 'about', EST: 'estimated', CAL: 'calculated', BEF: 'before', AFT: 'after',
};

/** Splits on a keyword at token level, so "TO" inside a place name cannot match. */
function splitOn(tokens: string[], keyword: string): [string[], string[]] | null {
  const at = tokens.indexOf(keyword);
  return at < 0 ? null : [tokens.slice(0, at), tokens.slice(at + 1)];
}

/**
 * null when the text cannot be understood — the caller keeps it verbatim.
 *
 * A qualifier nested inside a range (`BET AFT 31 JAN 1762 AND BEF 31 DEC 1762`)
 * is valid GEDCOM that one `qualifier` field cannot hold, so it fails here
 * rather than being silently flattened into something narrower than the truth.
 * Seven rows are like that; they keep their own text.
 */
export function parseGedcomDate(raw: string | null | undefined): GedcomDate | null {
  if (!raw) return null;
  const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const [head, ...rest] = tokens;

  const prefix = PREFIX[head!];
  if (prefix) {
    const from = parseParts(rest.join(' '));
    return from ? { qualifier: prefix, from, to: null } : null;
  }

  if (head === 'BET') {
    const halves = splitOn(rest, 'AND');
    if (!halves) return null;
    const from = parseParts(halves[0].join(' '));
    const to = parseParts(halves[1].join(' '));
    return from && to ? { qualifier: 'between', from, to } : null;
  }

  if (head === 'FROM') {
    const halves = splitOn(rest, 'TO');
    const from = parseParts((halves ? halves[0] : rest).join(' '));
    if (!from) return null;
    if (!halves) return { qualifier: 'period', from, to: null };
    const to = parseParts(halves[1].join(' '));
    return to ? { qualifier: 'period', from, to } : null;
  }

  // A period with no start. Ten rows have this and they mean two different
  // things — "died by 1803" and "was headmaster until 1965" — so this records
  // what is written and leaves the reading to whoever knows the event type.
  if (head === 'TO') {
    const to = parseParts(rest.join(' '));
    return to ? { qualifier: 'period', from: { ...EMPTY }, to } : null;
  }

  const from = parseParts(tokens.join(' '));
  return from ? { qualifier: 'exact', from, to: null } : null;
}
