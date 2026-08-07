import { describe, it, expect, afterEach } from 'vitest';
import {
  t, eventLabel, eventDescription, lifespan, displayName, formatGedcomDate,
  setLanguage, getLanguage, LANGUAGES,
} from './i18n';
import { DICTIONARIES } from './i18n/dictionaries';

afterEach(() => setLanguage('sv'));

describe('i18n', () => {
  it('resolves dot-paths and falls back to the key', () => {
    expect(t('nav.persons')).toBe('Personer');
    expect(t('search.button')).toBe('Sök');
    expect(t('finns.inte')).toBe('finns.inte');
  });

  it('has source and export strings', () => {
    expect(t('sources.title')).toBe('Källor');
    expect(t('export.download')).toBe('Ladda ner GEDCOM');
  });

  it('has issue strings', () => {
    expect(t('issues.title')).toBe('Konsekvensbänken');
    expect(t('issues.sev.error')).toBe('Logiskt fel');
    expect(t('issues.remaining')).toContain('{n}');
  });

  it('has edit strings', () => {
    expect(t('edit.save')).toBe('Spara');
    expect(t('edit.addChild')).toBe('Lägg till barn');
  });

  it('has tree strings', () => {
    expect(t('nav.tree')).toBe('Träd');
    expect(t('tree.ancestors')).toBe('Förfäder');
    expect(t('tree.instructions')).toContain('Piltangenter');
  });

  it('döljer GEDCOM-flaggan Y men behåller riktig text', () => {
    expect(eventDescription('Y')).toBeNull();      // "1 DEAT Y" är en flagga
    expect(eventDescription(' Y ')).toBeNull();
    expect(eventDescription('Snickare')).toBe('Snickare');
    expect(eventDescription(null)).toBeNull();
  });

  it('formaterar GEDCOM-datum på svenska', () => {
    expect(formatGedcomDate('15 APR 1942')).toBe('15 apr 1942');
    expect(formatGedcomDate('2 DEC 2014')).toBe('2 dec 2014');
    expect(formatGedcomDate('ABT 1715')).toBe('ca 1715');
    expect(formatGedcomDate('BEF 17 JUL 1719')).toBe('före 17 jul 1719');
    expect(formatGedcomDate('BET 1916 AND 1928')).toBe('BET 1916 och 1928');
    expect(formatGedcomDate('1834')).toBe('1834');
    expect(formatGedcomDate(null)).toBe('');
  });

  it('formats display names with id fallback', () => {
    expect(displayName({ givenName: 'Sven-Erik', surname: 'Wedin', id: 'I1' })).toBe('Sven-Erik Wedin');
    expect(displayName({ givenName: '', surname: '', id: 'I3' })).toBe('I3');
  });
});

describe('språkbyte', () => {
  it('byter alla ytor: strängar, händelsenamn, datum och årtalsprefix', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(t('nav.persons')).toBe('People');
    expect(eventLabel('BIRT')).toBe('Birth');
    expect(formatGedcomDate('15 APR 1942')).toBe('15 Apr 1942');
    expect(formatGedcomDate('ABT 1715')).toBe('about 1715');
    expect(lifespan(1942, null)).toBe('b. 1942');

    setLanguage('de');
    expect(t('nav.persons')).toBe('Personen');
    expect(eventLabel('MARR')).toBe('Heirat');
    expect(formatGedcomDate('15 MAR 1942')).toBe('15 März 1942');
    expect(lifespan(null, 2014)).toBe('gest. 2014');

    setLanguage('es');
    expect(t('nav.persons')).toBe('Personas');
    expect(eventLabel('DEAT')).toBe('Defunción');
    expect(formatGedcomDate('BEF 1719')).toBe('antes de 1719');
    expect(lifespan(1942, 2014)).toBe('1942–2014');
  });

  it('faller tillbaka på svenska för nycklar som saknas i ett språk', () => {
    setLanguage('en');
    // alla språk har samma nycklar i dag; en okänd nyckel ger själva sökvägen
    expect(t('finns.inte.alls')).toBe('finns.inte.alls');
  });

  it('ignorerar okända språkkoder', () => {
    setLanguage('sv');
    // @ts-expect-error avsiktligt fel språkkod
    setLanguage('klingon');
    expect(getLanguage()).toBe('sv');
  });

  it('har samma nyckeluppsättning i alla språk', () => {
    const paths = (obj: object, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? paths(value, `${prefix}${key}.`)
          : [`${prefix}${key}`]);
    const swedish = paths(DICTIONARIES.sv).sort();
    for (const { code } of LANGUAGES) {
      expect({ code, keys: paths(DICTIONARIES[code]).sort() }).toEqual({ code, keys: swedish });
    }
  });
});
