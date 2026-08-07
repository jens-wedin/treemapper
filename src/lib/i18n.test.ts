import { describe, it, expect } from 'vitest';
import { t, eventLabel, eventDescription, lifespan, displayName, formatGedcomDate } from './i18n';

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

  it('labels GEDCOM event types in Swedish with tag fallback', () => {
    expect(eventLabel('BIRT')).toBe('Födelse');
    expect(eventLabel('MARR')).toBe('Vigsel');
    expect(eventLabel('XYZZY')).toBe('XYZZY');
  });

  it('formats lifespans', () => {
    expect(lifespan(1845, 1941)).toBe('1845–1941');
    expect(lifespan(1942, null)).toBe('f. 1942');
    expect(lifespan(null, 1941)).toBe('d. 1941');
    expect(lifespan(null, null)).toBe('');
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
