import { countryFromPlace, countryName } from '../../lib/places';

/**
 * The country half of a place, for the select that sits beside the text box.
 *
 * The place itself stays one string: the hierarchy in this data runs from one
 * level (`Voxna`) to five (`Strömbacka Roten, Bjuråker, Gävleborgs, Hälsingland,
 * Sverige`), and a fixed set of boxes would mean deciding what every existing
 * place's levels are. Only the last segment is ever read or written here.
 */

/** The select's value when a place ends in something the list has never heard of. */
export const OTHER = 'other';

/**
 * The ISO code the place names, `''` when it names no country, or `OTHER`.
 *
 * `OTHER` is not "nothing": `Königsberg, Preussen` and `Bjuråker, Gävleborgs
 * län` both end in something that is not a known country, and in neither case
 * may the select quietly offer to overwrite it. Only a place with a single
 * segment, or one the list recognises, is safe to treat as answered.
 */
export function countryOf(place: string): string {
  if (!place.trim()) return '';
  const code = countryFromPlace(place);
  if (code) return code;
  return place.includes(',') ? OTHER : '';
}

/**
 * The place with `code` as its country — appended, replaced, or removed when
 * `code` is empty.
 *
 * A last segment the list does not recognise is treated as part of the place
 * rather than as a country to replace, because it usually is: a parish, a
 * province, or a country that no longer exists.
 */
export function withCountry(place: string, code: string): string {
  const trimmed = place.trim();
  if (!trimmed) return '';

  const segments = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  const namesCountry = countryFromPlace(trimmed) !== null;
  const body = namesCountry ? segments.slice(0, -1) : segments;

  if (!code || code === OTHER) return body.join(', ');

  const name = countryName(code);
  return name ? [...body, name].join(', ') : trimmed;
}
