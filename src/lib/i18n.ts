// Swedish UI strings. Spec decision: plain dictionary, i18n-ready, no library.
const sv = {
  appTitle: 'Wedin släktträd',
  nav: { home: 'Hem', persons: 'Personer', skip: 'Hoppa till innehåll' },
  home: { lead: 'Sök i släktträdet', searchLabel: 'Sök person' },
  search: {
    name: 'Namn', birthYear: 'Födelseår', place: 'Födelseort', button: 'Sök',
    hits: '{n} träffar', prev: 'Föregående', next: 'Nästa',
  },
  common: {
    loading: 'Läser in …', error: 'Något gick fel — nås API:et?',
    notFound: 'Personen finns inte.', backToList: 'Till personlistan',
  },
  person: {
    name: 'Namn', born: 'Född', died: 'Död', birthPlace: 'Födelseort',
    marriedName: 'gift', photos: 'Foton', timeline: 'Händelser',
    family: 'Familj', parents: 'Föräldrar', siblings: 'Syskon',
    spouse: 'Partner', marriage: 'Vigsel', children: 'Barn',
    note: 'Anteckning', citations: 'Källhänvisningar', source: 'Källa',
    age: 'ålder', quality: 'kvalitet',
  },
  stats: { persons: 'Personer', families: 'Familjer', sources: 'Källor', photos: 'Foton' },
} as const;

export function t(path: string): string {
  let cur: unknown = sv;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return path;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : path;
}

const EVENT_LABELS: Record<string, string> = {
  BIRT: 'Födelse', CHR: 'Dop', BAPM: 'Dop', DEAT: 'Död', BURI: 'Begravning',
  CREM: 'Kremering', MARR: 'Vigsel', DIV: 'Skilsmässa', ENGA: 'Förlovning',
  ANUL: 'Annullering', MARB: 'Lysning', RESI: 'Bosatt', OCCU: 'Yrke',
  EDUC: 'Utbildning', GRAD: 'Examen', EMIG: 'Emigration', IMMI: 'Immigration',
  NATU: 'Medborgarskap', CONF: 'Konfirmation', EVEN: 'Händelse', ADOP: 'Adoption',
  RETI: 'Pension', CENS: 'Folkräkning', PROB: 'Bouppteckning', WILL: 'Testamente',
  BLES: 'Välsignelse', NMR: 'Ogift',
};
export const eventLabel = (type: string): string => EVENT_LABELS[type] ?? type;

export function lifespan(birthYear: number | null, deathYear: number | null): string {
  if (birthYear != null && deathYear != null) return `${birthYear}–${deathYear}`;
  if (birthYear != null) return `f. ${birthYear}`;
  if (deathYear != null) return `d. ${deathYear}`;
  return '';
}

export function displayName(p: { givenName?: string | null; surname?: string | null; id: string }): string {
  return [p.givenName, p.surname].filter(Boolean).join(' ') || p.id;
}
