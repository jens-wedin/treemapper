import { describe, it, expect } from 'vitest';
import { extractYear, parseFullDate, daysBetween, yearRange } from './dates';

describe('extractYear', () => {
  it.each([
    ['15 APR 1942', 1942],
    ['ABT 1715', 1715],
    ['BEF 1789', 1789],
    ['BET 1700 AND 1710', 1700],
    ['1834', 1834],
    ['30 jan. 2009 kl 17.06', 2009],
    ['4 juli 1814 el 1812', 1814],
    ['Bef 1789-19 Feb 1810', 1789],
  ] as const)('parses %s → %d', (input, year) => {
    expect(extractYear(input)).toBe(year);
  });

  it.each(['17..', '17xx', '16...', '-', '0', 'INFANT', 'Unknown', 'okänt', '31 juli', '', null, undefined] as const)(
    'returns null for unparseable %s',
    (input) => {
      expect(extractYear(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('parseFullDate', () => {
  it('parses complete GEDCOM dates', () => {
    expect(parseFullDate('23 NOV 1845')).toEqual({ y: 1845, m: 11, d: 23 });
    expect(parseFullDate('5 APR 1942')).toEqual({ y: 1942, m: 4, d: 5 });
    expect(parseFullDate('08 JUL 2026')).toEqual({ y: 2026, m: 7, d: 8 });
  });

  it('returns null for anything less precise', () => {
    for (const raw of ['ABT 1715', 'JUN 1971', '1834', 'BEF 17 JUL 1719', '17xx', '', null]) {
      expect(parseFullDate(raw as string | null)).toBeNull();
    }
  });
});

describe('yearRange', () => {
  it('returns the span a fuzzy date can cover', () => {
    expect(yearRange('1845')).toEqual({ start: 1845, end: 1845 });
    expect(yearRange('23 NOV 1845')).toEqual({ start: 1845, end: 1845 });
    expect(yearRange('BET 1916 AND 1928')).toEqual({ start: 1916, end: 1928 });
    expect(yearRange('FROM 1687 TO 1694')).toEqual({ start: 1687, end: 1694 });
    expect(yearRange('BEF 1789')).toEqual({ start: null, end: 1789 });
    expect(yearRange('AFT 22 DEC 1933')).toEqual({ start: 1933, end: null });
    expect(yearRange('ABT 1715')).toEqual({ start: 1715, end: 1715 });
    expect(yearRange('okänt')).toEqual({ start: null, end: null });
  });
});

describe('daysBetween', () => {
  it('counts days between two full dates regardless of order', () => {
    expect(daysBetween({ y: 1934, m: 12, d: 30 }, { y: 1935, m: 6, d: 1 })).toBe(153);
    expect(daysBetween({ y: 1935, m: 6, d: 1 }, { y: 1934, m: 12, d: 30 })).toBe(153);
    expect(daysBetween({ y: 1900, m: 1, d: 1 }, { y: 1900, m: 1, d: 1 })).toBe(0);
  });
});
