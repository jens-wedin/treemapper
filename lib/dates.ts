/** First 3–4-digit number in a GEDCOM date string, if it looks like a year. */
export function extractYear(dateRaw: string | null | undefined): number | null {
  if (!dateRaw) return null;
  const m = dateRaw.match(/(?<!\d)(\d{3,4})(?!\d)/);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 100 && year <= 2100 ? year : null;
}

export interface FullDate { y: number; m: number; d: number }

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Day-precision parse of a plain GEDCOM date ("23 NOV 1845"). Returns null for
 * anything with a qualifier or missing component — detectors that need day
 * precision (siblings born too close) must skip fuzzy dates rather than guess.
 */
export function parseFullDate(dateRaw: string | null | undefined): FullDate | null {
  if (!dateRaw) return null;
  const m = /^\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})\s*$/.exec(dateRaw.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS[m[2]!];
  if (!month) return null;
  const d = Number(m[1]);
  if (d < 1 || d > 31) return null;
  return { y: Number(m[3]), m: month, d };
}

/** Absolute number of days between two full dates. */
export function daysBetween(a: FullDate, b: FullDate): number {
  const ms = Math.abs(Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d));
  return Math.round(ms / 86_400_000);
}
