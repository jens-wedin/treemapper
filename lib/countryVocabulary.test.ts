import { describe, it, expect } from 'vitest';
import { lookupCountry, statedCountries } from './countryVocabulary';

describe('lookupCountry', () => {
  it('knows a country the hand-written list never had', () => {
    expect(lookupCountry('Sydafrika')).toBe('ZA');
    expect(lookupCountry('Brazil')).toBe('BR');
  });

  it('knows the same country in each language the app speaks', () => {
    expect(lookupCountry('Sverige')).toBe('SE');
    expect(lookupCountry('Sweden')).toBe('SE');
    expect(lookupCountry('Schweden')).toBe('SE');
    expect(lookupCountry('Suecia')).toBe('SE');
  });

  it('keeps the hand-written forms that no standard list contains', () => {
    expect(lookupCountry('Swe')).toBe('SE');
    expect(lookupCountry('Förenta staterna')).toBe('US');
  });

  it('ignores the punctuation a parish register leaves behind', () => {
    expect(lookupCountry('Sweden.')).toBe('SE');
    expect(lookupCountry('  SVERIGE  ')).toBe('SE');
  });

  it('returns null for a name no country has', () => {
    expect(lookupCountry('Bjuråker')).toBeNull();
    expect(lookupCountry('')).toBeNull();
  });

  it('does not treat a two-letter county code as a country', () => {
    // 'AC' is Västerbotten and 'BD' is Norrbotten. Neither is a country, and
    // reading them as one would move half of northern Sweden abroad.
    expect(lookupCountry('AC')).toBeNull();
    expect(lookupCountry('BD')).toBeNull();
  });
});

describe('statedCountries', () => {
  it('finds the country when it sits last, where GEDCOM wants it', () => {
    expect(statedCountries('Bjuråker, Gävleborg, Sverige')).toEqual([
      { code: 'SE', index: 2, total: 3, bracketed: false, matched: 'Sverige' },
    ]);
  });

  it('finds a country stranded in the middle by the export', () => {
    const found = statedCountries('Frisbo 17, Bjuråker, Sweden, Gävleborgs, Hälsingland');
    expect(found).toEqual([
      { code: 'SE', index: 2, total: 5, bracketed: false, matched: 'Sweden' },
    ]);
  });

  it('finds a country written as the last word rather than its own segment', () => {
    expect(statedCountries('Kalmar Sverige')).toEqual([
      { code: 'SE', index: 0, total: 1, bracketed: false, matched: 'Sverige' },
    ]);
  });

  it('reports the country once when it is already a segment of its own', () => {
    // Both the segment scan and the last-word scan can see `Sverige` here; only
    // one of them may report it, or a rewrite would strip it twice.
    expect(statedCountries('Bjuråker, Sverige')).toHaveLength(1);
  });

  it('reports a bracketed country as bracketed, so nothing rewrites it', () => {
    const found = statedCountries('Strömbacka (Bjuråker, Sverige)');
    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('SE');
    expect(found[0]!.bracketed).toBe(true);
  });

  it('reads the country name and not the code beside it', () => {
    // "Belgien (BEL)" is one place, not Belgium plus something bracketed.
    const found = statedCountries('Belgien (BEL)');
    expect(found.map(f => f.code)).toEqual(['BE']);
  });

  it('says nothing about a place that names no country', () => {
    expect(statedCountries('Bjuråker Strömbacka')).toEqual([]);
  });

  it('leaves England alone rather than calling it the United Kingdom', () => {
    // England is what the record says and it is more precise than the country.
    expect(statedCountries('Manchester, England')).toEqual([]);
  });
});
