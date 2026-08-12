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
import { NOT_A_SPELLING, lookupCountry } from './places';

export { lookupCountry };

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

/**
 * The country a single piece of a place names, or null.
 *
 * Unlike `lookupCountry` this refuses England, Scotland, Wales and Holland:
 * they carry a country code for the flag, but they are what the record said and
 * a rewrite must not swallow them.
 */
export function readCountry(text: string | undefined | null): string | null {
  if (!text) return null;
  if (NOT_A_SPELLING.has(text.toLowerCase().replace(/[.,;:\s]+$/, '').trim())) return null;
  return lookupCountry(text);
}
