import { describe, it, expect } from 'vitest';
import { countryFromPlace, countryName, impliedCountry, isSubdivisionName, COUNTRY_NAMES } from './places';

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
    // a parish with no country → unknown, no guessing
    expect(countryFromPlace('Bjuråker')).toBeNull();
    expect(countryFromPlace('Sundsvalls Gustav Adolf')).toBeNull();
    expect(countryFromPlace('Lovvik 2, Undersvik, X')).toBeNull();
    expect(countryFromPlace('')).toBeNull();
    expect(countryFromPlace(null)).toBeNull();
  });

  it('trusts only the last segment', () => {
    // "Sverige" as the first part of the place must not decide the country
    expect(countryFromPlace('Sverige, Bjuråker')).toBeNull();
  });
});

describe('countryFromPlace, beyond the hand-written twenty-one', () => {
  it('reads a country the hand-written list never had', () => {
    expect(countryFromPlace('Port Natal, Durban, Sydafrika')).toBe('ZA');
    expect(countryFromPlace('Böhmen, Tjeckien')).toBe('CZ');
    expect(countryFromPlace('Rio De Janeiro, Brazil')).toBe('BR');
    expect(countryFromPlace('Chile')).toBe('CL');
  });

  it('still gives England the Union flag rather than nothing', () => {
    // NOT_A_SPELLING stops England being *rewritten* to Storbritannien. It must
    // not stop it being *read*, or those places lose their flag.
    expect(countryFromPlace('Manchester, England')).toBe('GB');
  });

  it('still trusts only the last segment', () => {
    // A country stranded mid-string is evidence for a proposal, never a fact.
    expect(countryFromPlace('Frisbo 17, Bjuråker, Sweden, Gävleborgs, Hälsingland')).toBeNull();
  });

  it('does not mistake a parish for a country', () => {
    expect(countryFromPlace('Bjuråker')).toBeNull();
    expect(countryFromPlace('Strömbacka, Bjuråker')).toBeNull();
  });
});

describe('countryName', () => {
  it('gives the canonical Swedish name for a code', () => {
    expect(countryName('SE')).toBe('Sverige');
    expect(countryName('NO')).toBe('Norge');
    expect(countryName('DE')).toBe('Tyskland');
    expect(countryName('US')).toBe('USA');
  });

  it('names a country the hand-written list never had, still in Swedish', () => {
    // `Sydafrika`, `Brazil`, `Chile` and `Tjeckien` are all in this tree, and
    // all four were recognised but could not be written: countryName returned
    // null, withCountryLast returned null, and the proposal was dropped without
    // a word. Seven places went unoffered that way.
    expect(countryName('ZA')).toBe('Sydafrika');
    expect(countryName('BR')).toBe('Brasilien');
    expect(countryName('CL')).toBe('Chile');
    expect(countryName('CZ')).toBe('Tjeckien');
  });

  it('gives null for a code no country uses', () => {
    expect(countryName('QQ')).toBeNull();
  });

  // Every alias must lead back to a name, or normalising would blank a country.
  it('names every country any alias can produce', () => {
    for (const alias of Object.keys(COUNTRY_NAMES)) {
      expect(countryName(COUNTRY_NAMES[alias]!), alias).not.toBeNull();
    }
  });
});

describe('impliedCountry', () => {
  it('reads a Swedish county code in brackets', () => {
    expect(impliedCountry('Bjuråker, Gävleborgs län (X)')).toBe('SE');
    expect(impliedCountry('Alnö (Y), Västernorrlands län')).toBe('SE');
    expect(impliedCountry('Sundborn, Kopparbergs Län (W)')).toBe('SE');
  });

  it('reads a county code standing as its own segment', () => {
    expect(impliedCountry('Umeå lfs, AC')).toBe('SE');
    expect(impliedCountry('Långvinds bruk, Enångers socken, Häls, X')).toBe('SE');
    expect(impliedCountry('Bruträsk 1, Skellefteå sn, Vb')).toBe('SE');
  });

  // The same position holds US state codes. A rule that read a shape rather
  // than the closed set of 21 would have moved Wisconsin to Sweden.
  it('is not fooled by a US state code in the same position', () => {
    expect(impliedCountry('Stanton, MN')).toBeNull();
    expect(impliedCountry('Milwaukee, WI')).toBeNull();
    expect(impliedCountry('Phoenix, AZ')).toBeNull();
    expect(impliedCountry('Austin, TX')).toBeNull();
    expect(impliedCountry('Fresno, CA')).toBeNull();
  });

  it('says nothing about a place that carries no code', () => {
    expect(impliedCountry('Bjuråker')).toBeNull();
    expect(impliedCountry('Västernorrland')).toBeNull();
    expect(impliedCountry('')).toBeNull();
  });

  it('leaves a place that already names its country to countryFromPlace', () => {
    expect(impliedCountry('Alnö (Y), Sverige')).toBeNull();
  });
});

describe('isSubdivisionName', () => {
  // England and Scotland share GB with Storbritannien for the flag's sake, but
  // they are more precise than it — renaming them would throw that away.
  it('protects a constituent country from being renamed to its state', () => {
    expect(isSubdivisionName('Bath, England')).toBe(true);
    expect(isSubdivisionName('Glasgow, Scotland')).toBe(true);
    expect(isSubdivisionName('Amsterdam, Holland')).toBe(true);
  });

  it('leaves an ordinary misspelling alone to be normalised', () => {
    expect(isSubdivisionName('Alnön, Sweden')).toBe(false);
    expect(isSubdivisionName('Bath, United Kingdom')).toBe(false);
  });
});

describe('the short forms of Sweden', () => {
  it.each(['Sundsvall, SE', 'Sundsvall, Swe', 'Sundsvall, Suecia'])('recognises %s', place => {
    expect(countryFromPlace(place)).toBe('SE');
  });
});
