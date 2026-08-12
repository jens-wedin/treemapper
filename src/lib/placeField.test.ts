import { describe, it, expect } from 'vitest';
import { countryOf, withCountry } from './placeField';

describe('reading the country out of a place', () => {
  it('finds the country the place names', () => {
    expect(countryOf('Alnön, Västernorrlands län, Sverige')).toBe('SE');
    expect(countryOf('Chicago, Illinois, USA')).toBe('US');
  });

  it('is empty when the place names none', () => {
    expect(countryOf('Bjuråker')).toBe('');
    expect(countryOf('')).toBe('');
  });

  // The select cannot hold Preussen, so the place keeps saying it and the
  // select steps aside rather than offering to overwrite it.
  it('reports an unknown last segment as somewhere else, not as nothing', () => {
    expect(countryOf('Königsberg, Preussen')).toBe('other');
  });

  it('does not mistake a parish for a country it has never heard of', () => {
    expect(countryOf('Bjuråker, Gävleborgs län')).toBe('other');
  });
});

describe('putting a country onto a place', () => {
  it('appends one where there was none', () => {
    expect(withCountry('Bjuråker', 'SE')).toBe('Bjuråker, Sverige');
  });

  it('replaces the one that is there', () => {
    expect(withCountry('Alnön, Sverige', 'NO')).toBe('Alnön, Norge');
    expect(withCountry('Chicago, Illinois, USA', 'SE')).toBe('Chicago, Illinois, Sverige');
  });

  it('removes it when the country is cleared', () => {
    expect(withCountry('Alnön, Västernorrlands län, Sverige', '')).toBe('Alnön, Västernorrlands län');
    expect(withCountry('Sverige', '')).toBe('');
  });

  it('leaves an unrecognised tail alone, because it may be a place, not a country', () => {
    expect(withCountry('Bjuråker, Gävleborgs län', 'SE')).toBe('Bjuråker, Gävleborgs län, Sverige');
    expect(withCountry('Königsberg, Preussen', '')).toBe('Königsberg, Preussen');
  });

  it('does nothing to an empty place', () => {
    expect(withCountry('', 'SE')).toBe('');
  });

  // One value, two views: what the select shows must be what the text says.
  it.each(['Bjuråker', 'Alnön, Sverige', 'Chicago, Illinois, USA', ''])(
    'round-trips %s through the select', place => {
      const code = countryOf(place);
      if (code === 'other') return;
      expect(withCountry(place, code)).toBe(place);
    });
});
