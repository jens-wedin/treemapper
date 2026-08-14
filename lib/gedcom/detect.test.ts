import { describe, it, expect } from 'vitest';
import { decodeGedcom } from './detect';

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
