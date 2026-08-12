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

/** Every ISO 3166-1 alpha-2 code, including the ones no country uses. */
const ALL_CODES = Array.from({ length: 26 * 26 }, (_, i) =>
  String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

/**
 * Forms this register uses that no standard list contains. Only what has been
 * seen in the data — `Swed.` appears 16 times. Guessing at further
 * abbreviations would be inventing evidence.
 */
const REGISTER_FORMS: Record<string, string> = {
  swed: 'SE',
  'amerikas förenta stater': 'US',
};

let vocabulary: Map<string, string> | null = null;

/**
 * Every country name this app can recognise: the 697 `Intl.DisplayNames` knows
 * across the four languages it speaks, with `COUNTRY_NAMES` laid over the top.
 *
 * The hand-written table wins, because it carries what a Swedish register
 * actually writes — `Suecia`, `Swe`, `Förenta staterna` — and because
 * `england` must keep mapping to GB for the flag.
 */
function vocab(): Map<string, string> {
  if (vocabulary) return vocabulary;
  const map = new Map<string, string>();

  for (const locale of ['sv', 'en', 'de', 'es']) {
    const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' });
    for (const code of ALL_CODES) {
      let name: string | undefined;
      try { name = names.of(code); } catch { continue; }
      if (!name || name === code) continue;
      const key = normaliseName(name);
      if (key && !map.has(key)) map.set(key, code);
    }
  }
  for (const [name, code] of Object.entries(COUNTRY_NAMES)) map.set(normaliseName(name), code);
  for (const [name, code] of Object.entries(REGISTER_FORMS)) map.set(normaliseName(name), code);

  vocabulary = map;
  return map;
}

/** Lowercased and stripped of the punctuation a parish register leaves behind. */
function normaliseName(text: string): string {
  return text.toLowerCase()
    .replace(/[.,;:\s]+$/, '').replace(/^[.,;:\s]+/, '')
    .replace(/\s+/g, ' ').trim();
}

/** The ISO code a name stands for, or null. */
export function lookupCountry(name: string | null | undefined): string | null {
  if (!name) return null;
  return vocab().get(normaliseName(name)) ?? null;
}

/**
 * ISO 3166-1 alpha-2 code when the place explicitly names a country, else null.
 *
 * Only the last segment is trusted, which is where GEDCOM puts a country. A
 * country stranded mid-string is evidence for a proposal on the Countries page,
 * never a fact — the survey found one place naming `Sweden` that turned out to
 * be a township in the United States.
 *
 * The vocabulary is the wide one. It used to be the hand-written 21, which
 * meant `Sydafrika`, `Chile`, `Brazil` and `Tjeckien` were all in this tree and
 * none of them counted as naming a country at all.
 */
export function countryFromPlace(place: string | null | undefined): string | null {
  if (!place) return null;
  const segments = place.split(',').map(s => s.trim()).filter(Boolean);
  if (!segments.length) return null;
  return lookupCountry(segments[segments.length - 1]);
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

/**
 * Swedish region names for everywhere `CANONICAL` does not reach.
 *
 * The hand-written table covers what a Swedish family tree mostly contains, and
 * it stays first because it carries forms this register uses — `USA` rather
 * than `Förenta staterna`, `Kanada` rather than `Canada`. But it is only 21
 * countries, and this tree also holds South Africa, Brazil, Chile and Czechia.
 * Those were recognised and then silently dropped: `countryName` returned null,
 * so `withCountryLast` returned null, so no proposal was ever offered.
 */
let swedishNames: Intl.DisplayNames | null = null;

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const canonical = CANONICAL[upper];
  if (canonical) return canonical;

  swedishNames ??= new Intl.DisplayNames(['sv'], { type: 'region', fallback: 'none' });
  try {
    // `fallback: 'none'` returns undefined rather than handing back the code,
    // which is what keeps a made-up code answering null.
    return swedishNames.of(upper) ?? null;
  } catch {
    return null;
  }
}

/**
 * Names that share a country code with a larger country while being real places
 * in their own right. They must never be rewritten to the canonical name:
 * England and Scotland both fly the Union flag here, and both are answers a
 * genealogist gave on purpose. Renaming them to "Storbritannien" would throw
 * away the more precise thing the record said.
 */
export const NOT_A_SPELLING = new Set(['england', 'scotland', 'skottland', 'wales', 'holland']);

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
