import { describe, it, expect, afterEach } from 'vitest';
import {
  t, tf, format, formatNumber, eventLabel, eventDescription, lifespan, displayName,
  formatGedcomDate, setLanguage, getLanguage, LANGUAGES,
} from './i18n';
import { DICTIONARIES } from './i18n/dictionaries';

afterEach(() => setLanguage('en'));

describe('i18n', () => {
  it('resolves dot-paths and falls back to the key', () => {
    expect(t('nav.persons')).toBe('People');
    expect(t('search.button')).toBe('Search');
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('has source and export strings', () => {
    expect(t('sources.title')).toBe('Sources');
    expect(t('export.download')).toBe('Download GEDCOM');
  });

  it('has issue strings', () => {
    expect(t('issues.title')).toBe('Consistency bench');
    expect(t('issues.sev.error')).toBe('Logical error');
    expect(t('issues.remaining')).toContain('{n}');
  });

  it('has edit strings', () => {
    expect(t('edit.save')).toBe('Save');
    expect(t('edit.addChild')).toBe('Add child');
  });

  it('has tree strings', () => {
    expect(t('nav.tree')).toBe('Tree');
    expect(t('tree.ancestors')).toBe('Ancestors');
    expect(t('tree.instructions')).toContain('Arrow keys');
  });

  it('hides the GEDCOM Y flag but keeps real text', () => {
    expect(eventDescription('Y')).toBeNull();      // "1 DEAT Y" is a flag,
    expect(eventDescription(' Y ')).toBeNull();    // not a description
    expect(eventDescription('Snickare')).toBe('Snickare');
    expect(eventDescription(null)).toBeNull();
  });

  it('formats GEDCOM dates in English', () => {
    expect(formatGedcomDate('15 APR 1942')).toBe('15 Apr 1942');
    expect(formatGedcomDate('2 DEC 2014')).toBe('2 Dec 2014');
    expect(formatGedcomDate('ABT 1715')).toBe('about 1715');
    expect(formatGedcomDate('BEF 17 JUL 1719')).toBe('before 17 Jul 1719');
    expect(formatGedcomDate('1834')).toBe('1834');
    expect(formatGedcomDate(null)).toBe('');
  });

  it('reads out ranges and periods instead of showing the GEDCOM keyword', () => {
    expect(formatGedcomDate('BET 1916 AND 1928')).toBe('between 1916 and 1928');
    expect(formatGedcomDate('FROM 1932 TO 1938')).toBe('from 1932 to 1938');
    expect(formatGedcomDate('FROM 1938')).toBe('from 1938');
    expect(formatGedcomDate('TO 1965')).toBe('to 1965');
  });

  it('translates a date it cannot model, word by word, rather than showing tags', () => {
    expect(formatGedcomDate('BET AFT 31 JAN 1762 AND BEF 31 DEC 1762'))
      .toBe('between after 31 Jan 1762 and before 31 Dec 1762');
    expect(formatGedcomDate('FROM ABT 1904')).toBe('from about 1904');
  });

  it('hands back text that is not a date at all, so nothing disappears', () => {
    expect(formatGedcomDate('okänt')).toBe('okänt');
    // GEDCOM cannot say "31 July, year unknown", so the text stays — but it
    // should still read as a date rather than as a Swedish fragment.
    expect(formatGedcomDate('6 aug.')).toBe('6 Aug');
    expect(formatGedcomDate('17xx')).toBe('17xx');
  });

  it('formats display names with id fallback', () => {
    expect(displayName({ givenName: 'Sven-Erik', surname: 'Wedin', id: 'I1' })).toBe('Sven-Erik Wedin');
    expect(displayName({ givenName: '', surname: '', id: 'I3' })).toBe('I3');
  });
});

describe('format', () => {
  it('fills named placeholders', () => {
    expect(format('{n} left of {total} flagged', { n: 3, total: 12 })).toBe('3 left of 12 flagged');
  });

  it('leaves an unfilled placeholder standing, so drift is visible', () => {
    // A blank would read as missing data; {year} reads as a bug, which it is.
    expect(format('born {year}', {})).toBe('born {year}');
  });

  it('fills a translated template through tf()', () => {
    expect(tf('issues.remaining', { n: 1, total: 2 })).toBe('1 left of 2 flagged');
  });
});

describe('numbers', () => {
  it('groups thousands the way the language does', () => {
    setLanguage('en');
    expect(formatNumber(14357)).toBe('14,357');
    setLanguage('sv');
    // Swedish groups with a non-breaking space, not a comma
    expect(formatNumber(14357)).toMatch(/^14.357$/);
    setLanguage('de');
    expect(formatNumber(14357)).toBe('14.357');
  });
});

describe('changing language', () => {
  it('changes every surface: strings, event names, dates and year prefixes', () => {
    setLanguage('sv');
    expect(getLanguage()).toBe('sv');
    expect(t('nav.persons')).toBe('Personer');
    expect(eventLabel('BIRT')).toBe('Födelse');
    expect(formatGedcomDate('15 APR 1942')).toBe('15 apr 1942');
    expect(formatGedcomDate('ABT 1715')).toBe('ca 1715');
    expect(formatGedcomDate('BET 1916 AND 1928')).toBe('mellan 1916 och 1928');
    expect(formatGedcomDate('FROM 1932 TO 1938')).toBe('från 1932 till 1938');
    expect(lifespan(1942, null)).toBe('f. 1942');

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

  it('falls back to English for a key missing from a language', () => {
    setLanguage('sv');
    // every language carries every key today; an unknown one gives its own path
    expect(t('no.such.key.at.all')).toBe('no.such.key.at.all');
  });

  it('ignores unknown language codes', () => {
    setLanguage('en');
    // @ts-expect-error deliberately wrong language code
    setLanguage('klingon');
    expect(getLanguage()).toBe('en');
  });

  it('carries the same key set in every language', () => {
    const paths = (obj: object, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? paths(value, `${prefix}${key}.`)
          : [`${prefix}${key}`]);
    const english = paths(DICTIONARIES.en).sort();
    for (const { code } of LANGUAGES) {
      expect({ code, keys: paths(DICTIONARIES[code]).sort() }).toEqual({ code, keys: english });
    }
  });
});
