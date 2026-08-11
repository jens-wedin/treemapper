import { describe, it, expect } from 'vitest';
import { countryFromPlace } from './places';

describe('countryFromPlace', () => {
  it('recognises the country at the end of a place string', () => {
    expect(countryFromPlace('Alnön, Västernorrlands län, Sverige')).toBe('SE');
    expect(countryFromPlace('Gävleborgs län, Sverige')).toBe('SE');
    expect(countryFromPlace('Sverige')).toBe('SE');
    expect(countryFromPlace('Chicago, Illinois, USA')).toBe('US');
    expect(countryFromPlace('Vasa, Finland')).toBe('FI');
  });

  it('ignores capitals and extra spaces', () => {
    expect(countryFromPlace('  Sundsvall ,  SVERIGE  ')).toBe('SE');
    expect(countryFromPlace('Oslo, norway')).toBe('NO');
  });

  it('gives null when the place names no country', () => {
    // socken utan land → okänt, ingen gissning
    expect(countryFromPlace('Bjuråker')).toBeNull();
    expect(countryFromPlace('Sundsvalls Gustav Adolf')).toBeNull();
    expect(countryFromPlace('Lovvik 2, Undersvik, X')).toBeNull();
    expect(countryFromPlace('')).toBeNull();
    expect(countryFromPlace(null)).toBeNull();
  });

  it('trusts only the last segment', () => {
    // "Sverige" som ortnamn först ska inte styra landet
    expect(countryFromPlace('Sverige, Bjuråker')).toBeNull();
  });
});
