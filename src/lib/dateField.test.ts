import { describe, it, expect } from 'vitest';
import { blankDateField, dateFieldError, fromRaw, toRaw } from './dateField';

describe('filling the form from what is stored', () => {
  it('spreads a full date across the parts', () => {
    expect(fromRaw('17 MAR 1942')).toEqual({
      ...blankDateField, qualifier: 'exact', fromDay: '17', fromMonth: '3', fromYear: '1942',
    });
  });

  it('leaves the day and month empty for a bare year', () => {
    expect(fromRaw('1821')).toEqual({ ...blankDateField, fromYear: '1821' });
  });

  it('fills both sides of a range', () => {
    expect(fromRaw('BET 1916 AND 1928')).toEqual({
      ...blankDateField, qualifier: 'between', fromYear: '1916', toYear: '1928',
    });
  });

  it('keeps a qualifier', () => {
    expect(fromRaw('ABT 1715')).toEqual({ ...blankDateField, qualifier: 'about', fromYear: '1715' });
  });

  it('is blank for no date at all', () => {
    expect(fromRaw('')).toEqual(blankDateField);
    expect(fromRaw(null)).toEqual(blankDateField);
  });

  // The escape hatch exists for these, and the form must not pretend it can
  // hold them — a date it cannot model has to stay exactly as it was written.
  it('hands a date it cannot model to the text box, untouched', () => {
    expect(fromRaw('okänt')).toEqual({ ...blankDateField, text: 'okänt' });
    expect(fromRaw('BET AFT 31 JAN 1762 AND BEF 31 DEC 1762'))
      .toEqual({ ...blankDateField, text: 'BET AFT 31 JAN 1762 AND BEF 31 DEC 1762' });
  });
});

describe('writing back what the form holds', () => {
  it('writes canonical GEDCOM', () => {
    expect(toRaw({ ...blankDateField, fromDay: '17', fromMonth: '3', fromYear: '1942' }))
      .toBe('17 MAR 1942');
    expect(toRaw({ ...blankDateField, qualifier: 'between', fromYear: '1916', toYear: '1928' }))
      .toBe('BET 1916 AND 1928');
  });

  it('gives back free text unchanged, so an oddity survives being edited', () => {
    expect(toRaw({ ...blankDateField, text: 'INFANT' })).toBe('INFANT');
  });

  it('is empty when there is no year to anchor the date', () => {
    expect(toRaw(blankDateField)).toBe('');
    expect(toRaw({ ...blankDateField, fromDay: '17', fromMonth: '3' })).toBe('');
  });

  // Half a range is not nonsense, it is a weaker claim — say that rather than
  // writing "BET 1916 AND " and calling it a date.
  it('narrows a half-filled range to the claim it can actually support', () => {
    expect(toRaw({ ...blankDateField, qualifier: 'between', fromYear: '1916' })).toBe('AFT 1916');
    expect(toRaw({ ...blankDateField, qualifier: 'between', toYear: '1928' })).toBe('BEF 1928');
  });

  it('keeps a period open at either end, which GEDCOM allows', () => {
    expect(toRaw({ ...blankDateField, qualifier: 'period', fromYear: '1932' })).toBe('FROM 1932');
    expect(toRaw({ ...blankDateField, qualifier: 'period', toYear: '1965' })).toBe('TO 1965');
  });
});

describe('the round trip through the form', () => {
  it.each([
    '17 MAR 1942', 'MAR 1942', '1942', 'ABT 1715', 'BEF 1789', 'AFT 1800',
    'BET 1916 AND 1928', 'FROM 1932 TO 1938', 'FROM 1938', 'TO 1965', 'okänt', '',
  ])('opening %s in the form and saving it again changes nothing', raw => {
    expect(toRaw(fromRaw(raw))).toBe(raw);
  });
});

describe('refusing a date that is not one', () => {
  const field = (over: Partial<typeof blankDateField>) => ({ ...blankDateField, ...over });

  it('is happy with nothing typed yet', () => {
    expect(dateFieldError(blankDateField)).toBeNull();
    expect(dateFieldError(field({ fromYear: '1902' }))).toBeNull();
    expect(dateFieldError(field({ fromDay: '17', fromMonth: '3', fromYear: '1942' }))).toBeNull();
  });

  it('names a day the month does not have', () => {
    expect(dateFieldError(field({ fromDay: '31', fromMonth: '2', fromYear: '1902' })))
      .toBe('edit.dateNoSuchDay');
    expect(dateFieldError(field({ fromDay: '45', fromMonth: '3', fromYear: '1902' })))
      .toBe('edit.dateNoSuchDay');
  });

  it('asks for a month when a day has been given without one', () => {
    expect(dateFieldError(field({ fromDay: '17', fromYear: '1942' }))).toBe('edit.dateNeedsMonth');
  });

  it('asks for a year, which is the one part a date cannot do without', () => {
    expect(dateFieldError(field({ fromMonth: '3' }))).toBe('edit.dateNeedsYear');
    expect(dateFieldError(field({ fromDay: '17', fromMonth: '3' }))).toBe('edit.dateNeedsYear');
  });

  it('checks the far end of a range too', () => {
    expect(dateFieldError(field({
      qualifier: 'between', fromYear: '1902', toDay: '31', toMonth: '2', toYear: '1910',
    }))).toBe('edit.dateNoSuchDay');
  });

  it('says nothing about free text, which is kept as written by design', () => {
    expect(dateFieldError(field({ text: 'INFANT' }))).toBeNull();
  });

  it('stores nothing at all while the date is impossible', () => {
    expect(toRaw(field({ fromDay: '31', fromMonth: '2', fromYear: '1902' }))).toBe('');
    expect(toRaw(field({ fromDay: '45', fromMonth: '3', fromYear: '1902' }))).toBe('');
  });
});
