/** First 3–4-digit number in a GEDCOM date string, if it looks like a year. */
export function extractYear(dateRaw: string | null | undefined): number | null {
  if (!dateRaw) return null;
  const m = dateRaw.match(/(?<!\d)(\d{3,4})(?!\d)/);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 100 && year <= 2100 ? year : null;
}
