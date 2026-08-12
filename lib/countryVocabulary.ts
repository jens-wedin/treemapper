/**
 * Every country name the app can recognise, and where one sits in a place.
 *
 * `lib/places.ts` knows 21 countries by hand, which is what the family tree
 * mostly contains and what `countryFromPlace()` — the authoritative reader —
 * still uses. It is too narrow for finding a country that is *already written*
 * somewhere unexpected: `Sydafrika` and `Brazil` are both in this data and
 * neither was in the list, so both were guessed at instead of read.
 *
 * The wider vocabulary comes from `Intl.DisplayNames`, the same mechanism
 * `countryLabel()` uses for the statistics: 697 names across the four languages
 * the app speaks, with nothing to keep in step by hand.
 */
import { COUNTRY_NAMES, NOT_A_SPELLING } from './places';

/** Every ISO 3166-1 alpha-2 code, including the ones no country uses. */
const ALL_CODES = Array.from({ length: 26 * 26 }, (_, i) =>
  String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

/**
 * Forms this register uses that no standard list contains.
 *
 * Only what has actually been seen in the data — `Swed.` appears 16 times.
 * Guessing at further abbreviations would be inventing evidence.
 */
const REGISTER_FORMS: Record<string, string> = { swed: 'SE' };

let vocabulary: Map<string, string> | null = null;

function vocab(): Map<string, string> {
  if (vocabulary) return vocabulary;
  const map = new Map<string, string>();

  for (const locale of ['sv', 'en', 'de', 'es']) {
    const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' });
    for (const code of ALL_CODES) {
      let name: string | undefined;
      try { name = names.of(code); } catch { continue; }
      if (!name || name === code) continue;
      const k = normalise(name);
      if (k && !map.has(k)) map.set(k, code);
    }
  }
  // The hand-written list wins: it carries `Suecia`, `Swe` and `Förenta
  // staterna`, and it is what the rest of the app already agrees with.
  for (const [name, code] of Object.entries(COUNTRY_NAMES)) map.set(normalise(name), code);
  for (const [name, code] of Object.entries(REGISTER_FORMS)) map.set(normalise(name), code);

  vocabulary = map;
  return map;
}

/** Lowercased, trimmed, and stripped of the punctuation a register leaves behind. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[.,;:\s]+$/, '').replace(/^[.,;:\s]+/, '').replace(/\s+/g, ' ').trim();
}

/** The ISO code a name stands for, or null. */
export function lookupCountry(name: string | null | undefined): string | null {
  if (!name) return null;
  return vocab().get(normalise(name)) ?? null;
}

export interface StatedCountry {
  code: string;
  /** Which comma segment named it, and how many there are. */
  index: number;
  total: number;
  /** Inside brackets, where the text must be left alone. */
  bracketed: boolean;
  /** The exact text recognised, so a rewrite knows what to remove. */
  matched: string;
}

/** A bracket holding only a short code — `(BEL)`, `(Y)` — is a suffix, not a place. */
const isShortCode = (inner: string) => /^[A-Za-z]{1,3}$/.test(inner.trim());

/**
 * Every country named anywhere in a place string.
 *
 * Unlike `countryFromPlace()` this looks beyond the last segment, because the
 * export stranded countries in the middle (`Frisbo 17, Bjuråker, Sweden,
 * Gävleborgs, Hälsingland`) and inside brackets. A country found anywhere other
 * than last is evidence rather than proof — the survey found one place naming
 * `Sweden` that turned out to be a township in the United States — so callers
 * must treat it as something to propose, never as something to apply.
 *
 * England, Scotland, Wales and Holland are skipped: they map to a country code
 * for the flag, but they are what the record said and rewriting them loses it.
 */
export function statedCountries(place: string | null | undefined): StatedCountry[] {
  if (!place?.trim()) return [];
  const found: StatedCountry[] = [];

  for (const match of place.matchAll(/\(([^)]*)\)/g)) {
    const inner = match[1] ?? '';
    if (isShortCode(inner)) continue;
    for (const part of inner.split(',')) {
      const code = readCountry(part);
      if (code) found.push({ code, index: 0, total: 1, bracketed: true, matched: part.trim() });
    }
  }

  const outer = place.replace(/\([^)]*\)/g, ' ');
  const segments = outer.split(',');
  let foundOutside = false;
  segments.forEach((segment, index) => {
    const code = readCountry(segment);
    if (!code) return;
    foundOutside = true;
    found.push({ code, index, total: segments.length, bracketed: false, matched: segment.trim() });
  });

  // `Kalmar Sverige` — a country written as the last word of a segment rather
  // than as a segment of its own. Only worth looking for when no segment named
  // one, so `Bjuråker, Sverige` is not reported twice.
  if (!foundOutside) {
    const words = outer.trim().split(/\s+/);
    const last = words[words.length - 1];
    const code = readCountry(last);
    if (code && words.length > 1) {
      found.push({
        code, index: segments.length - 1, total: segments.length,
        bracketed: false, matched: last!.trim(),
      });
    }
  }

  return found;
}

function readCountry(text: string | undefined): string | null {
  if (!text) return null;
  const k = normalise(text);
  if (NOT_A_SPELLING.has(k)) return null;
  return vocab().get(k) ?? null;
}
