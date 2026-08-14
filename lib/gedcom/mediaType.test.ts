import { describe, it, expect } from 'vitest';
import { mediaType, canonicalForm } from './mediaType';

describe('mediaType (extension → IANA type for 7.0)', () => {
  it('maps known extensions', () => {
    expect(mediaType('jpg')).toBe('image/jpeg');
    expect(mediaType('jpeg')).toBe('image/jpeg');
    expect(mediaType('png')).toBe('image/png');
    expect(mediaType('gif')).toBe('image/gif');
    expect(mediaType('pdf')).toBe('application/pdf');
  });
  it('passes an already-typed value through and keeps null', () => {
    expect(mediaType('image/jpeg')).toBe('image/jpeg');
    expect(mediaType(null)).toBeNull();
    expect(mediaType('xyz')).toBe('application/octet-stream');
  });
});

describe('canonicalForm (import: type/extension → stored extension)', () => {
  it('maps a media type back to the stored extension', () => {
    expect(canonicalForm('image/jpeg')).toBe('jpg');
    expect(canonicalForm('image/png')).toBe('png');
  });
  it('leaves a bare extension and null alone', () => {
    expect(canonicalForm('jpg')).toBe('jpg');
    expect(canonicalForm(null)).toBeNull();
  });
  it('normalises the 7.0 null-form fallback back to null on import', () => {
    expect(canonicalForm('application/octet-stream')).toBeNull();
  });
});
