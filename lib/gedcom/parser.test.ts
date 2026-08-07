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

  it('folds a CONC that continues a full line straight on, and CONT as a newline', () => {
    const full = 'x'.repeat(200);                 // the writer's line limit
    const text = [
      `0 @N1@ NOTE ${full}`,
      '1 CONC  lång text',
      '1 CONT Ny rad',
    ].join('\n');
    const [note] = parseGedcom(text);
    expect(note.value).toBe(`${full} lång text\nNy rad`);
  });

  /**
   * MyHeritage never emits CONT — in the real export all 10 190 continuations
   * are CONC, including the ones that mean "new line". A CONC after a line
   * that never reached the limit could not have been a length split, so it is
   * read as the line break it was meant to be. Without this, citation texts
   * arrive as "Sven-Erik WedinKön: ManHemvist: Sundsvall".
   */
  it('reads a CONC that continues a short line as a line break', () => {
    const text = [
      '0 @S1@ SOUR',
      '1 DATA',
      '2 TEXT Sven-Erik Wedin',
      '3 CONC Kön: Man',
      '3 CONC Hemvist: Sundsvall, Sverige',
    ].join('\n');
    const [sour] = parseGedcom(text);
    expect(sour.children[0]!.children[0]!.value)
      .toBe('Sven-Erik Wedin\nKön: Man\nHemvist: Sundsvall, Sverige');
  });

  it('measures the line limit in bytes, not characters', () => {
    // MyHeritage fills a line to 200 bytes; "ö" costs two, so a full line can
    // be 196 characters long. Counting characters made it look short, and a
    // break got inserted in the middle of a word — right inside "&lt;br&gt;".
    const full = `${'x'.repeat(192)}öööö`;          // 196 characters, 200 bytes
    expect(full.length).toBe(196);
    expect(new TextEncoder().encode(full).length).toBe(200);
    const text = [`0 @N1@ NOTE ${full}`, '1 CONC rest'].join('\n');
    expect(parseGedcom(text)[0]!.value).toBe(`${full}rest`);
  });

  it('keeps a value that was split purely for length in one piece', () => {
    // three full lines then a short tail: one long run-on sentence, no breaks
    const a = 'a'.repeat(200), b = 'b'.repeat(200), c = 'c'.repeat(200);
    const text = [`0 @N1@ NOTE ${a}`, `1 CONC ${b}`, `1 CONC ${c}`, '1 CONC slut'].join('\n');
    const [note] = parseGedcom(text);
    expect(note.value).toBe(`${a}${b}${c}slut`);
    expect(note.value).not.toContain('\n');
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
