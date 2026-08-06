import { describe, it, expect } from 'vitest';
import { t, eventLabel, lifespan, displayName } from './i18n';

describe('i18n', () => {
  it('resolves dot-paths and falls back to the key', () => {
    expect(t('nav.persons')).toBe('Personer');
    expect(t('search.button')).toBe('Sök');
    expect(t('finns.inte')).toBe('finns.inte');
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

  it('formats display names with id fallback', () => {
    expect(displayName({ givenName: 'Sven-Erik', surname: 'Wedin', id: 'I1' })).toBe('Sven-Erik Wedin');
    expect(displayName({ givenName: '', surname: '', id: 'I3' })).toBe('I3');
  });
});
