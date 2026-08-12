/**
 * Country recognition from GEDCOM place strings.
 *
 * Deliberately conservative (owner decision 2026-08-07): a country is only
 * reported when the place text actually names one. A bare parish like
 * "Bjuråker" stays unknown rather than being assumed Swedish — a genealogy
 * tool must not quietly invent facts.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  sverige: 'SE', sweden: 'SE', se: 'SE', swe: 'SE', suecia: 'SE',
  norge: 'NO', norway: 'NO',
  danmark: 'DK', denmark: 'DK',
  finland: 'FI', suomi: 'FI',
  island: 'IS', iceland: 'IS',
  usa: 'US', 'u.s.a.': 'US', 'united states': 'US', 'united states of america': 'US',
  'förenta staterna': 'US', amerika: 'US',
  kanada: 'CA', canada: 'CA',
  tyskland: 'DE', germany: 'DE', deutschland: 'DE',
  frankrike: 'FR', france: 'FR',
  nederländerna: 'NL', holland: 'NL', netherlands: 'NL',
  belgien: 'BE', belgium: 'BE',
  italien: 'IT', italy: 'IT',
  polen: 'PL', poland: 'PL',
  estland: 'EE', estonia: 'EE',
  lettland: 'LV', latvia: 'LV',
  ryssland: 'RU', russia: 'RU',
  irland: 'IE', ireland: 'IE',
  storbritannien: 'GB', 'united kingdom': 'GB', england: 'GB',
  skottland: 'GB', scotland: 'GB', wales: 'GB',
  spanien: 'ES', spain: 'ES',
  schweiz: 'CH', switzerland: 'CH',
  österrike: 'AT', austria: 'AT',
};

/** ISO 3166-1 alpha-2 code when the place explicitly names a country, else null. */
export function countryFromPlace(place: string | null | undefined): string | null {
  if (!place) return null;
  const segments = place.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!segments.length) return null;
  // The country belongs last in a GEDCOM place; only trust that position.
  return COUNTRY_NAMES[segments[segments.length - 1]!] ?? null;
}

/**
 * The canonical name for a country code, in Swedish.
 *
 * Swedish because a place name is data, not interface: the project writes its
 * code and its documents in English, and leaves what people actually wrote in
 * the register alone. A Swedish parish followed by "Sweden" is a MyHeritage
 * artefact rather than something anyone recorded. The display language is a
 * separate matter — the flags and the statistics go through the code, so they
 * follow whatever language the reader has chosen.
 */
const CANONICAL: Record<string, string> = {
  SE: 'Sverige', NO: 'Norge', DK: 'Danmark', FI: 'Finland', IS: 'Island',
  US: 'USA', CA: 'Kanada', DE: 'Tyskland', FR: 'Frankrike', NL: 'Nederländerna',
  BE: 'Belgien', IT: 'Italien', PL: 'Polen', EE: 'Estland', LV: 'Lettland',
  RU: 'Ryssland', IE: 'Irland', GB: 'Storbritannien', ES: 'Spanien',
  CH: 'Schweiz', AT: 'Österrike',
};

export function countryName(code: string | null | undefined): string | null {
  return code ? CANONICAL[code.toUpperCase()] ?? null : null;
}

/**
 * Names that share a country code with a larger country while being real places
 * in their own right. They must never be rewritten to the canonical name:
 * England and Scotland both fly the Union flag here, and both are answers a
 * genealogist gave on purpose. Renaming them to "Storbritannien" would throw
 * away the more precise thing the record said.
 */
const NOT_A_SPELLING = new Set(['england', 'scotland', 'skottland', 'wales', 'holland']);

/** True when rewriting this place's country to the canonical name would lose something. */
export function isSubdivisionName(place: string | null | undefined): boolean {
  if (!place?.trim()) return false;
  return NOT_A_SPELLING.has(place.split(',').pop()!.trim().toLowerCase());
}

/**
 * The 21 Swedish county letter codes, plus `Vb` for Västerbotten written short.
 *
 * A **closed set**, checked exactly — never a shape. The same position in a
 * place string holds US state codes (`WI`, `MN`, `AZ`, `TX`, `CA`), and a rule
 * reading "one or two letters at the end" would have moved Wisconsin to Sweden.
 * None of these 22 collides with a US state code, which is what makes the rule
 * safe at all.
 */
const SWEDISH_COUNTY_CODES = new Set([
  'AB', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'M', 'N', 'O',
  'S', 'T', 'U', 'W', 'X', 'Y', 'Z', 'AC', 'BD', 'VB',
]);

/**
 * 'SE' when a place carries proof of being Swedish without naming the country —
 * a county code in brackets (`Alnö (Y)`) or standing as its own segment
 * (`Umeå lfs, AC`). Null for everything else.
 *
 * A parish name is not proof. Every human reader knows Bjuråker is in
 * Gävleborg; the record does not say so, and this module has refused to assume
 * since 2026-08-07.
 */
export function impliedCountry(place: string | null | undefined): string | null {
  if (!place?.trim()) return null;
  if (countryFromPlace(place)) return null;   // it says so itself; nothing to imply

  const isCode = (token: string) => SWEDISH_COUNTY_CODES.has(token.trim().toUpperCase());

  for (const match of place.matchAll(/\(([^)]{1,2})\)/g)) {
    if (isCode(match[1]!)) return 'SE';
  }
  return place.split(',').some(segment => isCode(segment)) ? 'SE' : null;
}
