import { describe, it, expect } from 'vitest';
import { extractYear } from './dates';

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
