import { useSyncExternalStore } from 'react';
import { DICTIONARIES, FALLBACK, EVENT_LABELS, MONTHS, QUALIFIERS, type Lang } from './dictionaries';

export type { Lang };
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
];

const STORAGE_KEY = 'wedin-tree-sprak';
const listeners = new Set<() => void>();

function readStored(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && stored in DICTIONARIES) return stored;
  } catch {
    /* storage unavailable — fall through */
  }
  return 'sv';
}

let current: Lang = readStored();

export const getLanguage = (): Lang => current;

export function setLanguage(lang: Lang): void {
  if (!(lang in DICTIONARIES) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* a preference is a nicety — ignore storage failures */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach(notify => notify());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Subscribing anywhere in the tree re-renders it on a language change; `t()`
 * itself stays a plain function so components can call it without a hook.
 */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

function lookup(dict: unknown, path: string[]): string | undefined {
  let node: unknown = dict;
  for (const part of path) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Translated string for a dot-path; falls back to Swedish, then to the path. */
export function t(path: string): string {
  const parts = path.split('.');
  return lookup(DICTIONARIES[current], parts) ?? lookup(FALLBACK, parts) ?? path;
}

export const eventLabel = (type: string): string =>
  EVENT_LABELS[current][type] ?? EVENT_LABELS.sv[type] ?? type;

export function lifespan(birthYear: number | null, deathYear: number | null): string {
  if (birthYear != null && deathYear != null) return `${birthYear}–${deathYear}`;
  if (birthYear != null) return `${t('common.bornAbbr')} ${birthYear}`;
  if (deathYear != null) return `${t('common.diedAbbr')} ${deathYear}`;
  return '';
}

export function displayName(p: { givenName?: string | null; surname?: string | null; id: string }): string {
  return [p.givenName, p.surname].filter(Boolean).join(' ') || p.id;
}

/**
 * GEDCOM writes "1 DEAT Y" to assert that an event happened. The Y is a flag,
 * not a description — it is kept in the database for lossless export but must
 * never be shown as if it were text.
 */
export const eventDescription = (description: string | null | undefined): string | null =>
  !description || description.trim() === 'Y' ? null : description;

const MONTH_TAGS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** GEDCOM date → readable in the current language, e.g. "15 APR 1942". */
export function formatGedcomDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const months = MONTHS[current];
  const qualifiers = QUALIFIERS[current];
  return raw
    .trim()
    .split(/\s+/)
    .map(token => {
      const upper = token.toUpperCase();
      const monthIndex = MONTH_TAGS.indexOf(upper);
      if (monthIndex >= 0) return months[monthIndex]!;
      if (upper === 'ABT' || upper === 'EST' || upper === 'CAL') return qualifiers.about;
      if (upper === 'BEF') return qualifiers.before;
      if (upper === 'AFT') return qualifiers.after;
      if (upper === 'AND') return qualifiers.and;
      return token;
    })
    .join(' ');
}
