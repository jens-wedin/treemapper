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
