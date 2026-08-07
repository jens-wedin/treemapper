import { describe, it, expect } from 'vitest';
import { countryFromPlace } from './places';

describe('countryFromPlace', () => {
  it('känner igen land sist i platssträngen', () => {
    expect(countryFromPlace('Alnön, Västernorrlands län, Sverige')).toBe('SE');
    expect(countryFromPlace('Gävleborgs län, Sverige')).toBe('SE');
    expect(countryFromPlace('Sverige')).toBe('SE');
    expect(countryFromPlace('Chicago, Illinois, USA')).toBe('US');
    expect(countryFromPlace('Vasa, Finland')).toBe('FI');
  });

  it('bryr sig inte om versaler eller extra mellanslag', () => {
    expect(countryFromPlace('  Sundsvall ,  SVERIGE  ')).toBe('SE');
    expect(countryFromPlace('Oslo, norway')).toBe('NO');
  });

  it('ger null när platsen inte namnger något land', () => {
    // socken utan land → okänt, ingen gissning
    expect(countryFromPlace('Bjuråker')).toBeNull();
    expect(countryFromPlace('Sundsvalls Gustav Adolf')).toBeNull();
    expect(countryFromPlace('Lovvik 2, Undersvik, X')).toBeNull();
    expect(countryFromPlace('')).toBeNull();
    expect(countryFromPlace(null)).toBeNull();
  });

  it('litar bara på sista segmentet', () => {
    // "Sverige" som ortnamn först ska inte styra landet
    expect(countryFromPlace('Sverige, Bjuråker')).toBeNull();
  });
});
