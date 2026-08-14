// Stored `form` is a bare file extension (jpg, png…) — 5.5.1's shape and our
// download filename. 7.0 wants an IANA media type on FILE.FORM.
//
// Key order matters: where two extensions share a media type (jpeg/jpg,
// tiff/tif), the LAST one wins as the canonical form in the reverse
// (TYPE_TO_EXT) map below, since Object.fromEntries keeps the last value for a
// repeated key. Re-sorting or alphabetising this map would silently change
// what canonicalForm() returns.
const EXT_TO_TYPE: Record<string, string> = {
  jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  tiff: 'image/tiff', tif: 'image/tiff', bmp: 'image/bmp', webp: 'image/webp',
  heic: 'image/heic', pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime',
};
const TYPE_TO_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_TO_TYPE).map(([ext, type]) => [type, ext]),
);

export function mediaType(form: string | null): string | null {
  if (form == null) return null;
  if (form.includes('/')) return form;               // already a media type
  return EXT_TO_TYPE[form.toLowerCase()] ?? 'application/octet-stream';
}

export function canonicalForm(value: string | null): string | null {
  if (value == null) return null;
  if (value.toLowerCase() === 'application/octet-stream') return null;
  return value.includes('/') ? (TYPE_TO_EXT[value.toLowerCase()] ?? value) : value;
}

// A `form` safe to splice into a file name or a zip entry name: a short
// alphanumeric extension, or null. `form` is stored verbatim (canonicalForm
// keeps an unknown media type as-is, and a foreign file's FORM is
// attacker-controlled), so anything bearing a slash or `..` — a path traversal
// waiting to happen — is rejected here, at the point a name is built from it.
// Callers apply their own fallback (`jpg`, `bin`) for the null case.
export function safeFormExt(form: string | null): string | null {
  return form != null && /^[a-z0-9]{1,10}$/i.test(form) ? form : null;
}
