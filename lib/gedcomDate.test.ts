import { describe, it, expect } from 'vitest';
import { parseGedcomDate, toGedcom } from './gedcomDate';


describe('parsing a plain date', () => {
  it('reads a full GEDCOM date', () => {
    expect(parseGedcomDate('17 MAR 1942')).toEqual({
      qualifier: 'exact', from: { day: 17, month: 3, year: 1942 }, to: null,
    });
  });

  it('reads a month and a year, leaving the day empty', () => {
    expect(parseGedcomDate('MAR 1942')).toEqual({
      qualifier: 'exact', from: { day: null, month: 3, year: 1942 }, to: null,
    });
  });

  it('reads a bare year', () => {
    expect(parseGedcomDate('1821')).toEqual({
      qualifier: 'exact', from: { day: null, month: null, year: 1821 }, to: null,
    });
  });

  it('refuses a day that month does not have', () => {
    expect(parseGedcomDate('31 FEB 1902')).toBeNull();
    expect(parseGedcomDate('31 APR 1902')).toBeNull();
    expect(parseGedcomDate('30 FEB 1902')).toBeNull();
    expect(parseGedcomDate('45 MAR 1902')).toBeNull();
    expect(parseGedcomDate('0 MAR 1902')).toBeNull();
  });

  it('knows which Februaries have 29 days', () => {
    expect(parseGedcomDate('29 FEB 1904')).not.toBeNull();   // leap
    expect(parseGedcomDate('29 FEB 1900')).toBeNull();       // century, not leap
    expect(parseGedcomDate('29 FEB 2000')).not.toBeNull();   // divisible by 400
    expect(parseGedcomDate('29 FEB 1903')).toBeNull();
  });

  it('refuses a year outside anything a parish register could hold', () => {
    expect(parseGedcomDate('17 MAR 3')).toBeNull();
    expect(parseGedcomDate('MAR 12')).toBeNull();
  });

  it('refuses text that holds no date', () => {
    expect(parseGedcomDate('okänt')).toBeNull();
    expect(parseGedcomDate('-')).toBeNull();
    expect(parseGedcomDate('')).toBeNull();
    expect(parseGedcomDate(null)).toBeNull();
  });
});

describe('month names people actually type', () => {
  const march = { qualifier: 'exact', from: { day: 17, month: 3, year: 1942 }, to: null };

  it.each([
    ['17 MAR 1942', 'the GEDCOM tag'],
    ['17 mar 1942', 'lower case'],
    ['17 March 1942', 'English, written out'],
    ['17 mars 1942', 'Swedish'],
    ['17 mars. 1942', 'Swedish with a full stop'],
    ['17 März 1942', 'German'],
    ['17 marzo 1942', 'Spanish'],
  ])('reads %s (%s)', raw => {
    expect(parseGedcomDate(raw)).toEqual(march);
  });

  it('tells the Swedish and German fifth month apart', () => {
    expect(parseGedcomDate('1 maj 1900')!.from.month).toBe(5);
    expect(parseGedcomDate('1 Mai 1900')!.from.month).toBe(5);
    expect(parseGedcomDate('1 mars 1900')!.from.month).toBe(3);
  });

  it('reads an ISO date, because people paste them', () => {
    expect(parseGedcomDate('1942-03-17')).toEqual(march);
    expect(parseGedcomDate('1942-03')).toEqual({
      qualifier: 'exact', from: { day: null, month: 3, year: 1942 }, to: null,
    });
  });
});

describe('qualifiers', () => {
  it.each([
    ['ABT 1715', 'about'],
    ['EST 1715', 'estimated'],
    ['CAL 1715', 'calculated'],
    ['BEF 1789', 'before'],
    ['AFT 1800', 'after'],
  ])('reads %s as %s', (raw, qualifier) => {
    expect(parseGedcomDate(raw)).toEqual({
      qualifier, from: { day: null, month: null, year: Number(raw.slice(-4)) }, to: null,
    });
  });

  it('refuses a qualifier with nothing after it', () => {
    expect(parseGedcomDate('ABT')).toBeNull();
  });
});

describe('ranges and periods', () => {
  it('reads a between range', () => {
    expect(parseGedcomDate('BET 1916 AND 1928')).toEqual({
      qualifier: 'between',
      from: { day: null, month: null, year: 1916 },
      to: { day: null, month: null, year: 1928 },
    });
  });

  it('reads a period with both ends', () => {
    expect(parseGedcomDate('FROM 1932 TO 1938')).toEqual({
      qualifier: 'period',
      from: { day: null, month: null, year: 1932 },
      to: { day: null, month: null, year: 1938 },
    });
  });

  it('reads a period that is still open at the end', () => {
    expect(parseGedcomDate('FROM 1938')).toEqual({
      qualifier: 'period',
      from: { day: null, month: null, year: 1938 },
      to: null,
    });
  });

  // Ten rows have this, and they mean two different things: DEAT TO 1803 is
  // "died by then", OCCU TO 1965 is "was headmaster until then". Guessing here
  // would be wrong for half of them, so the parser only records what it sees.
  it('reads a bare TO as a period whose start is unknown', () => {
    expect(parseGedcomDate('TO 1965')).toEqual({
      qualifier: 'period',
      from: { day: null, month: null, year: null },
      to: { day: null, month: null, year: 1965 },
    });
  });

  it('refuses a range with a qualifier nested inside it, rather than dropping it', () => {
    expect(parseGedcomDate('BET AFT 31 JAN 1762 AND BEF 31 DEC 1762')).toBeNull();
    expect(parseGedcomDate('FROM ABT 1904')).toBeNull();
  });
});

describe('writing canonical GEDCOM', () => {
  const write = (raw: string) => toGedcom(parseGedcomDate(raw)!);

  it.each([
    ['17 MAR 1942', '17 MAR 1942'],
    ['MAR 1942', 'MAR 1942'],
    ['1942', '1942'],
    ['ABT 1715', 'ABT 1715'],
    ['EST 1715', 'EST 1715'],
    ['BEF 1789', 'BEF 1789'],
    ['AFT 1800', 'AFT 1800'],
    ['BET 1916 AND 1928', 'BET 1916 AND 1928'],
    ['FROM 1932 TO 1938', 'FROM 1932 TO 1938'],
    ['FROM 1938', 'FROM 1938'],
    ['TO 1965', 'TO 1965'],
  ])('leaves %s alone', (raw, expected) => {
    expect(write(raw)).toBe(expected);
  });

  it('pads nothing and uppercases the month', () => {
    expect(write('7 mar 1942')).toBe('7 MAR 1942');
  });

  it('drops a day that has no month, because it cannot be placed', () => {
    expect(toGedcom({ qualifier: 'exact', from: { day: 7, month: null, year: 1942 }, to: null }))
      .toBe('1942');
  });
});

describe('the round trip', () => {
  // The property that stops the reader and the writer drifting apart: whatever
  // the writer emits, the reader must read back as the same date.
  it.each([
    '17 MAR 1942', 'MAR 1942', '1942', 'ABT 1715', 'CAL 1900', 'BEF 1789',
    'AFT 1800', 'BET 1916 AND 1928', 'BET 13 MAR 1805 AND 1816',
    'FROM 1932 TO 1938', 'FROM 24 FEB 1955', 'TO 10 OCT 1697',
  ])('reads back what it wrote for %s', raw => {
    const once = parseGedcomDate(raw)!;
    expect(once).not.toBeNull();
    expect(parseGedcomDate(toGedcom(once))).toEqual(once);
  });
});
