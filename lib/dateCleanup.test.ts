import { describe, it, expect } from 'vitest';
import { planDateFix } from './dateCleanup';

const event = (over: Partial<Parameters<typeof planDateFix>[0]> = {}) => ({
  type: 'BIRT', dateRaw: null, description: null, place: null, ...over,
});

describe('leaving well alone', () => {
  it.each(['17 MAR 1942', 'MAR 1942', '1942', 'ABT 1715', 'BEF 1789', 'FROM 1932 TO 1938'])(
    'has nothing to do with %s', dateRaw => {
      expect(planDateFix(event({ dateRaw }))).toBeNull();
    });

  it('leaves a date it cannot model completely untouched', () => {
    expect(planDateFix(event({ dateRaw: 'BET AFT 31 JAN 1762 AND BEF 31 DEC 1762' }))).toBeNull();
    expect(planDateFix(event({ dateRaw: 'FROM ABT 1904', type: 'OCCU' }))).toBeNull();
  });

  it('has nothing to do with an event that has no date', () => {
    expect(planDateFix(event({ dateRaw: null }))).toBeNull();
    expect(planDateFix(event({ dateRaw: '   ' }))).toBeNull();
  });
});

describe('normalising', () => {
  it('writes a Swedish month as the GEDCOM tag', () => {
    expect(planDateFix(event({ dateRaw: '17 mar 1942' })))
      .toEqual({ reason: 'normalise', dateRaw: '17 MAR 1942', description: null, place: null });
  });
});

describe('converting a shape that means something else', () => {
  it.each([
    ['17xx', 'BET 1700 AND 1799'],
    ['17..', 'BET 1700 AND 1799'],
    ['16..', 'BET 1600 AND 1699'],
    ['16...', 'BET 1600 AND 1699'],
    ['18xx', 'BET 1800 AND 1899'],
  ])('reads %s as the century it names', (dateRaw, expected) => {
    expect(planDateFix(event({ dateRaw }))).toEqual({
      reason: 'century', dateRaw: expected, description: null, place: null,
    });
  });

  // A death recorded as a period ending in 1803 is a death *before* 1803. An
  // occupation held until 1965 is not — it is a period, and says so.
  it('turns a bare TO on a death into a before', () => {
    expect(planDateFix(event({ type: 'DEAT', dateRaw: 'TO 1803' })))
      .toEqual({ reason: 'period-end-is-before', dateRaw: 'BEF 1803', description: null, place: null });
  });

  it('leaves a bare TO on an occupation as the period it is', () => {
    expect(planDateFix(event({ type: 'OCCU', dateRaw: 'TO 1965' }))).toBeNull();
    expect(planDateFix(event({ type: 'RESI', dateRaw: 'TO 1964' }))).toBeNull();
  });

  // GEDCOM's BET means an uncertain single date; a residence spanning years is
  // a period. MyHeritage exported 2 328 of them the other way round.
  it('turns a residence range into the period it describes', () => {
    expect(planDateFix(event({ type: 'RESI', dateRaw: 'BET 1916 AND 1928' })))
      .toEqual({ reason: 'residence-period', dateRaw: 'FROM 1916 TO 1928', description: null, place: null });
  });

  it('leaves a birth range alone, where BET really does mean uncertainty', () => {
    expect(planDateFix(event({ type: 'BIRT', dateRaw: 'BET 1916 AND 1928' }))).toBeNull();
  });
});

describe('rescuing what is not a date', () => {
  it.each(['-', '0', 'Unknown', 'okänt'])('blanks the placeholder %s, with nothing to keep', dateRaw => {
    expect(planDateFix(event({ dateRaw, description: 'Snickare' })))
      .toEqual({ reason: 'placeholder', dateRaw: null, description: 'Snickare', place: null });
  });

  it('moves text that is not a date into the description', () => {
    expect(planDateFix(event({ type: 'DEAT', dateRaw: 'INFANT' })))
      .toEqual({ reason: 'rescue-to-description', dateRaw: null, description: 'INFANT', place: null });
  });

  it('appends to a description that is already there, rather than overwriting it', () => {
    expect(planDateFix(event({ dateRaw: 'Aktiv 2013', description: 'Ordförande' })))
      .toEqual({
        reason: 'rescue-to-description', dateRaw: null,
        description: 'Ordförande — Aktiv 2013', place: null,
      });
  });

  it('ignores the GEDCOM Y flag when appending, because it is not a description', () => {
    expect(planDateFix(event({ type: 'DEAT', dateRaw: 'INFANT', description: 'Y' })))
      .toEqual({ reason: 'rescue-to-description', dateRaw: null, description: 'INFANT', place: null });
  });

  // One row has a parish in the date column, and it goes to the description
  // like everything else: `INFANT` and `arbrå` are the same shape, so a rule
  // that sorted one into the place column would be guessing at the other.
  it('does not try to tell a misplaced parish from an age at death', () => {
    expect(planDateFix(event({ type: 'BIRT', dateRaw: 'arbrå' })))
      .toEqual({ reason: 'rescue-to-description', dateRaw: null, description: 'arbrå', place: null });
  });

  // Two readings, so no reading. The text is kept and a person decides.
  it('does not guess at an ambiguous date', () => {
    expect(planDateFix(event({ dateRaw: '4 juli 1814 el 1812' })))
      .toEqual({
        reason: 'rescue-to-description', dateRaw: null,
        description: '4 juli 1814 el 1812', place: null,
      });
  });
});
