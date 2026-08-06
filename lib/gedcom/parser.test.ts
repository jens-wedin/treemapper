import { describe, it, expect } from 'vitest';
import { parseGedcom } from './parser';

describe('parseGedcom', () => {
  it('parses records with xrefs, nesting, and values', () => {
    const text = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Sven-Erik /Wedin/',
      '2 GIVN Sven-Erik',
      '1 BIRT',
      '2 DATE 15 APR 1942',
      '0 TRLR',
    ].join('\n');
    const recs = parseGedcom(text);
    expect(recs).toHaveLength(3);
    const indi = recs[1];
    expect(indi.xref).toBe('@I1@');
    expect(indi.tag).toBe('INDI');
    expect(indi.children.map(c => c.tag)).toEqual(['NAME', 'BIRT']);
    expect(indi.children[0].children[0].value).toBe('Sven-Erik');
    expect(indi.children[1].children[0].value).toBe('15 APR 1942');
  });

  it('folds CONC (no separator) and CONT (newline) into the parent value', () => {
    const text = [
      '0 @N1@ NOTE Det var en',
      '1 CONC  lång text',
      '1 CONT Ny rad',
    ].join('\n');
    const [note] = parseGedcom(text);
    expect(note.value).toBe('Det var en lång text\nNy rad');
  });

  it('strips BOM and skips blank lines', () => {
    const text = '﻿0 HEAD\n\n0 TRLR\n';
    expect(parseGedcom(text)).toHaveLength(2);
  });

  it('handles value-less lines and pointer values', () => {
    const text = ['0 @F1@ FAM', '1 HUSB @I1@', '1 MARR'].join('\n');
    const [fam] = parseGedcom(text);
    expect(fam.children[0].value).toBe('@I1@');
    expect(fam.children[1].value).toBeUndefined();
  });

  it('throws on malformed lines', () => {
    expect(() => parseGedcom('nonsense')).toThrow(/Malformed/);
  });

  // The real MyHeritage export contains note text on its own lines that starts
  // with digits ("1709 gm", "31 October …") — these must not crash the import.
  it('recovers garbage lines with implausible levels as continuations', () => {
    const warnings: string[] = [];
    const text = ['0 @I1@ INDI', '1 NOTE Han föddes', '1709 gm', '1 SEX M'].join('\n');
    const [indi] = parseGedcom(text, warnings);
    expect(indi.children.map(c => c.tag)).toEqual(['NOTE', 'SEX']);
    expect(indi.children[0].value).toBe('Han föddes\n1709 gm');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('1709 gm');
  });

  it('recovers lines that do not match the GEDCOM format at all', () => {
    const text = ['0 @I1@ INDI', '1 NOTE x', 'bara text', '1 SEX M'].join('\n');
    const [indi] = parseGedcom(text);
    expect(indi.children[0].value).toBe('x\nbara text');
    expect(indi.children[1].tag).toBe('SEX');
  });
});
