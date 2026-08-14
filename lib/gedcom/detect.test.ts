import { describe, it, expect } from 'vitest';
import { decodeGedcom, detectGedcom, UnsupportedGedcom } from './detect';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('decodeGedcom', () => {
  const sample = '0 HEAD\n1 GEDC\n2 VERS 7.0\n0 TRLR';
  it('decodes plain UTF-8 (with and without a BOM)', () => {
    expect(decodeGedcom(Buffer.from(sample, 'utf-8'))).toBe(sample);
    expect(decodeGedcom(Buffer.from('﻿' + sample, 'utf-8'))).toBe(sample);
  });
  it('decodes UTF-16 LE and BE by their BOM', () => {
    expect(decodeGedcom(Buffer.from('﻿' + sample, 'utf-16le'))).toBe(sample);
    // Node has no 'utf-16be' Buffer encoding; build BE bytes by swapping LE.
    const le = Buffer.from('﻿' + sample, 'utf-16le');
    const be = Buffer.from(le); for (let i = 0; i + 1 < be.length; i += 2) { const t = be[i]!; be[i] = be[i + 1]!; be[i + 1] = t; }
    expect(decodeGedcom(be)).toBe(sample);
  });
});

const head = (vers: string, char?: string, syst = false) =>
  Buffer.from(['0 HEAD', ...(syst ? ['1 SYST PAF'] : []), '1 GEDC', `2 VERS ${vers}`, ...(char ? [`1 CHAR ${char}`] : []), '0 TRLR'].join('\n'), 'utf-8');

describe('detectGedcom', () => {
  it('detects the supported versions', () => {
    expect(detectGedcom(head('7.0')).version).toBe('7.0');
    expect(detectGedcom(head('5.5.1', 'UTF-8')).version).toBe('5.5.1');
    expect(detectGedcom(head('5.5', 'UTF-8')).version).toBe('5.5');
    expect(detectGedcom(head('7.0')).text).toContain('0 HEAD');
  });
  it('rejects PAF, ANSEL, and unsupported versions with a typed error', () => {
    expect(() => detectGedcom(head('5.5.1', 'ANSEL'))).toThrow(UnsupportedGedcom);
    expect(() => detectGedcom(head('5.5.1', 'ANSEL'))).toThrow(/ANSEL/);
    expect(() => detectGedcom(Buffer.from('0 HEAD\n1 SYST PAF\n1 GEDC\n2 VERS 5.5.1\n0 TRLR', 'utf-8'))).toThrow(/PAF/);
    expect(() => detectGedcom(head('5.6', 'UTF-8'))).toThrow(/5\.6/);
    expect(() => detectGedcom(head('4.0'))).toThrow(UnsupportedGedcom);
  });
  it('flags a file with no GEDCOM header as notGedcom, a real unsupported version as not', () => {
    const caught = (b: Buffer) => { try { detectGedcom(b); } catch (e) { return e as UnsupportedGedcom; } throw new Error('did not throw'); };
    // no 1 GEDC / 2 VERS at all → this is simply not a GEDCOM file
    expect(caught(Buffer.from('this is not a gedcom file')).notGedcom).toBe(true);
    // a real GEDCOM header, just a version we do not support → not the same thing
    expect(caught(head('4.0')).notGedcom).toBe(false);
  });
});

describe('detectGedcom fixture-driven tests', () => {
  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

  it('detects GEDCOM 7.0 from a file', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'foreign70.ged'));
    const result = detectGedcom(content);
    expect(result.version).toBe('7.0');
    expect(result.text).toContain('0 HEAD');
  });

  it('detects UTF-16 LE encoded GEDCOM 5.5.1', () => {
    const utf16Content = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 TRLR';
    const buffer = Buffer.from(utf16Content, 'utf-16le');
    const result = detectGedcom(buffer);
    expect(result.version).toBe('5.5.1');
  });

  it('rejects ANSEL charset from file', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'ansel.ged'));
    expect(() => detectGedcom(content)).toThrow(UnsupportedGedcom);
    expect(() => detectGedcom(content)).toThrow(/ANSEL/);
  });

  it('rejects PAF system from file', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'paf.ged'));
    expect(() => detectGedcom(content)).toThrow(UnsupportedGedcom);
    expect(() => detectGedcom(content)).toThrow(/PAF/);
  });
});
