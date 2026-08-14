/**
 * Decode raw GEDCOM bytes to a string. Character width and byte order come from
 * the first two bytes, per version-detection.md: FF FE / 30 00 → UTF-16 LE,
 * FE FF / 00 30 → UTF-16 BE, otherwise a single-byte encoding (decoded as UTF-8;
 * the version/charset scan then rejects ANSEL and friends). A leading BOM is
 * stripped.
 */
export function decodeGedcom(bytes: Buffer): string {
  const b0 = bytes[0], b1 = bytes[1];
  let enc: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8';
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0x30 && b1 === 0x00)) enc = 'utf-16le';
  else if ((b0 === 0xfe && b1 === 0xff) || (b0 === 0x00 && b1 === 0x30)) enc = 'utf-16be';
  return new TextDecoder(enc).decode(bytes).replace(/^﻿/, '');
}

export type SupportedVersion = '7.0' | '5.5.1' | '5.5';

export class UnsupportedGedcom extends Error {
  /**
   * True when the file has no GEDCOM header at all (no `1 GEDC` / `2 VERS`), so
   * it is simply not a GEDCOM — as opposed to a real GEDCOM whose version or
   * charset we cannot read. The importer uses this to tell "that isn't a GEDCOM
   * file" from "re-export as 5.5.1 or 7.0".
   */
  constructor(message: string, readonly detail: string, readonly notGedcom = false) {
    super(message);
    this.name = 'UnsupportedGedcom';
  }
}

function matchVersion(v: string): SupportedVersion | undefined {
  const t = v.trim();
  if (/^7\.\d/.test(t)) return '7.0';            // 7.x → the 7.0 reader
  if (t.startsWith('5.5.1')) return '5.5.1';     // longest match before 5.5
  if (t === '5.5' || t.startsWith('5.5 ')) return '5.5';
  return undefined;                              // 5.6, 5.5.5, 5.4, 5.0, 4.x, 3.0 …
}

const LINE = /^(\d+)\s+(?:@[^@]+@\s+)?(\S+)(?:\s+(.*))?$/;

/**
 * Detect a GEDCOM file's version and decode it. PAF (`1 SYST`), unsupported
 * versions, and non-UTF-8 single-byte charsets (ANSEL) throw UnsupportedGedcom
 * — we reject rather than mis-parse. 7.0 has no CHAR (it is always UTF-8).
 */
export function detectGedcom(bytes: Buffer): { version: SupportedVersion; text: string } {
  const text = decodeGedcom(bytes);
  let sawGedc = false, syst = false;
  let versionToken: string | undefined, charset: string | undefined;
  for (const line of text.slice(0, 4096).split(/\r\n|\r|\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, lvl, tag, val] = m;
    if (lvl === '1' && tag === 'SYST') syst = true;
    if (lvl === '1' && tag === 'GEDC') {
      if (syst) {
        throw new UnsupportedGedcom("This looks like a PAF GEDCOM, which isn't supported — re-export as GEDCOM 5.5.1 or 7.0.", 'PAF (1 SYST)');
      }
      sawGedc = true;
    }
    if (lvl === '2' && tag === 'VERS' && sawGedc && versionToken === undefined) versionToken = val ?? '';
    if (lvl === '1' && tag === 'CHAR') charset = (val ?? '').trim().toUpperCase();
    if (lvl === '0' && tag !== 'HEAD' && versionToken !== undefined) break;   // past the header
  }
  const version = versionToken !== undefined ? matchVersion(versionToken) : undefined;
  if (!version) {
    // No version token at all means there was no GEDCOM header to read one from
    // — the file isn't a GEDCOM, which is a different message from a real GEDCOM
    // whose version we don't support.
    if (versionToken === undefined) {
      throw new UnsupportedGedcom('This does not look like a GEDCOM file — it has no GEDCOM header.', 'no-header', true);
    }
    throw new UnsupportedGedcom(`GEDCOM version ${versionToken.trim() || '(not found)'} isn't supported — re-export as 5.5.1 or 7.0.`, versionToken.trim() || 'unknown');
  }
  // 7.0 is always UTF-8 (no CHAR). For 5.5.x, only UTF-8/ASCII decode correctly here.
  if (version !== '7.0' && charset && !['UTF-8', 'UTF8', 'UNICODE', 'ASCII'].includes(charset)) {
    throw new UnsupportedGedcom(`This file uses the ${charset} character set, which isn't supported — re-export as UTF-8.`, `CHAR ${charset}`);
  }
  return { version, text };
}
