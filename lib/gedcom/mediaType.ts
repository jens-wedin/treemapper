// Stored `form` is a bare file extension (jpg, png…) — 5.5.1's shape and our
// download filename. 7.0 wants an IANA media type on FILE.FORM.
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
  return value.includes('/') ? (TYPE_TO_EXT[value.toLowerCase()] ?? value) : value;
}
