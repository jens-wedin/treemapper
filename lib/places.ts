/**
 * Country recognition from GEDCOM place strings.
 *
 * Deliberately conservative (owner decision 2026-08-07): a country is only
 * reported when the place text actually names one. A bare parish like
 * "Bjuråker" stays unknown rather than being assumed Swedish — a genealogy
 * tool must not quietly invent facts.
 */
const COUNTRY_NAMES: Record<string, string> = {
  sverige: 'SE', sweden: 'SE',
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
