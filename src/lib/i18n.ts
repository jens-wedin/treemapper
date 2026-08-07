// Swedish UI strings. Spec decision: plain dictionary, i18n-ready, no library.
const sv = {
  appTitle: 'Wedin släktträd',
  nav: {
    home: 'Hem', persons: 'Personer', tree: 'Träd', issues: 'Konsekvens',
    sources: 'Källor', settings: 'Inställningar', skip: 'Hoppa till innehåll',
  },
  sources: {
    title: 'Källor', search: 'Sök källa', author: 'Författare', publication: 'Utgivare',
    citations: 'Källhänvisningar', usedBy: 'Används av', count: 'Antal hänvisningar',
    none: 'Inga källhänvisningar.', truncated: 'Visar de första {n} hänvisningarna.',
    backToSources: 'Till källistan', notFound: 'Källan finns inte.', page: 'Sida',
  },
  export: {
    title: 'Inställningar', gedcom: 'Exportera GEDCOM',
    gedcomHelp: 'Laddar ner hela trädet som en GEDCOM 5.5.1-fil — säkerhetskopia och väg ut ur appen. Filen kan läsas av MyHeritage, Ancestry, Gramps med flera.',
    download: 'Ladda ner GEDCOM',
    backupNote: 'Kom ihåg att också säkerhetskopiera media-mappen — foton ingår inte i GEDCOM-filen, bara länkarna till dem.',
    cliNote: 'Från terminalen: npm run export',
  },
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
  issues: {
    title: 'Konsekvensbänken',
    lead: 'Granska och åtgärda problem i trädet, värst först.',
    fix: 'Åtgärda', dismiss: 'Avfärda', undismiss: 'Återställ', dismissedBadge: 'Avfärdad',
    showDismissed: 'Visa avfärdade',
    remaining: '{n} kvar av {total} flaggade',
    scoreboard: 'Konsekvensproblem',
    category: 'Kategori', allCategories: 'Alla kategorier',
    noIssues: 'Inga kvarvarande problem här. Bra jobbat!',
    truncated: 'Visar de första {n} problemen — filtrera på kategori för att se fler.',
    merge: 'Slå ihop', mergeTitle: 'Slå ihop dubbletter',
    keepThis: 'Behåll den här', survivor: 'Post som behålls', duplicate: 'Post som tas bort',
    mergeWarning: 'Sammanslagningen tar bort den andra posten. Allt loggas i ändringshistoriken och kan återställas manuellt.',
    confirmMerge: 'Slå ihop posterna', mergedOk: 'Posterna slogs ihop.',
    field: 'Fält', chooseValue: 'Välj värde', events: 'händelser', citations: 'källor', photos: 'foton',
    pickTwo: 'Välj två poster att jämföra',
    sev: { error: 'Logiskt fel', dup: 'Dubblett', warning: 'Varning', info: 'Övrigt', minor: 'Småfel' },
  },
  edit: {
    edit: 'Redigera', save: 'Spara', cancel: 'Avbryt', remove: 'Ta bort',
    confirmRemove: 'Ta bort händelsen? Detta loggas i ändringshistoriken.',
    addEvent: 'Lägg till händelse', eventType: 'Typ', date: 'Datum (fritext, t.ex. ABT 1715)',
    place: 'Plats', description: 'Beskrivning', age: 'Ålder',
    addChild: 'Lägg till barn', addSpouse: 'Lägg till partner', addParent: 'Lägg till förälder',
    pickExisting: 'Välj befintlig person', createNew: 'Skapa ny person',
    firstName: 'Förnamn', lastName: 'Efternamn', sex: 'Kön',
    sexM: 'Man', sexF: 'Kvinna', sexU: 'Okänt',
    family: 'Familj', marriedName: 'Giftasnamn', suffix: 'Suffix', note: 'Anteckning',
    saved: 'Sparat', noHits: 'Inga träffar', searchFirst: 'Sök och välj en person',
  },
  tree: {
    title: 'Träd', showInTree: 'Visa i träd', chart: 'Diagram', list: 'Lista',
    ancestors: 'Förfäder', descendants: 'Ättlingar',
    generationsUp: 'Generationer uppåt', generationsDown: 'Generationer nedåt',
    zoomIn: 'Zooma in', zoomOut: 'Zooma ut', zoomReset: 'Återställ vy',
    goToPerson: 'Gå till personsida', focusOn: 'Fokusera trädet på',
    showFlags: 'Visa flaggor',
    chartLabel: 'Släktträdsdiagram',
    instructions: 'Piltangenter flyttar mellan släktingar, Enter fokuserar trädet på vald person.',
  },
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
