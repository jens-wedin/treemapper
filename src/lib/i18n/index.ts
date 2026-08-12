import { useSyncExternalStore } from 'react';
import { DICTIONARIES, FALLBACK, EVENT_LABELS, MONTHS, QUALIFIERS, type Lang } from './dictionaries';
import { readPreference, writePreference } from '../storage';
import { monthNumber, parseGedcomDate, type DateParts } from '../../../lib/gedcomDate';

export type { Lang };
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
];

/** For Intl. The app's own language codes are deliberately shorter than these. */
const LOCALES: Record<Lang, string> = { en: 'en-GB', sv: 'sv-SE', de: 'de-DE', es: 'es-ES' };

const STORAGE_KEY = 'wedin-tree-language';
const LEGACY_KEY = 'wedin-tree-sprak';
const listeners = new Set<() => void>();

function readStored(): Lang {
  const stored = readPreference(STORAGE_KEY, LEGACY_KEY) as Lang | null;
  if (stored && stored in DICTIONARIES) return stored;
  return 'en';
}

let current: Lang = readStored();

export const getLanguage = (): Lang => current;

/**
 * Tells the document what language it is in, before the first paint.
 *
 * `index.html` can only name one language, and it names English. A reader who
 * chose Swedish would otherwise get Swedish prose inside `<html lang="en">`,
 * which is what sends a screen reader off in an English voice.
 */
export function startLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function setLanguage(lang: Lang): void {
  if (!(lang in DICTIONARIES) || lang === current) return;
  current = lang;
  writePreference(STORAGE_KEY, lang);
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

/** Translated string for a dot-path; falls back to English, then to the path. */
export function t(path: string): string {
  const parts = path.split('.');
  return lookup(DICTIONARIES[current], parts) ?? lookup(FALLBACK, parts) ?? path;
}

/**
 * Fills `{name}`, `{year}` and friends in a translated template.
 *
 * The server describes a problem as a code and the values behind it — the
 * sentence is assembled here, in the reader's language. Word order differs
 * between the four, which is exactly why the server cannot do it.
 *
 * An unknown placeholder is left standing rather than blanked: `{year}` in the
 * output says a template and its parameters have drifted apart, where an empty
 * gap would just look like missing data.
 */
export const format = (template: string, params: Record<string, string | number> = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole);

/** A translated template, filled: `tf('issueText.died-too-old', { name, age })`. */
export const tf = (path: string, params: Record<string, string | number> = {}): string =>
  format(t(path), params);

/**
 * The BCP 47 tag behind the current language, for `Intl` and `toLocaleString`.
 * 14 357 or 14,357 — a thousands separator is part of a translation.
 */
export const uiLocale = (): string => LOCALES[current];

/**
 * A country's name in the reader's language: 'SE' → Sweden, Sverige, Schweden,
 * Suecia. `Intl` already knows all of these, so there is no table to keep in
 * step with the flags — and no fifth language to translate by hand later.
 *
 * This is display only. What is *stored* in a place string is the Swedish name,
 * because a place name is data; `countryName()` in lib/places.ts writes that.
 * The two must not be confused: one follows the reader, the other follows the
 * register.
 */
const displayNames = new Map<string, Intl.DisplayNames>();

export function countryLabel(code: string): string {
  if (!code) return '';
  const locale = uiLocale();
  if (!displayNames.has(locale)) {
    displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
  }
  // Intl throws on a malformed code and returns the code itself for an unknown
  // one; either way a code on screen beats an empty cell.
  try {
    return displayNames.get(locale)!.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The common case: a count, grouped the way the reader expects. */
export const formatNumber = (n: number): string => n.toLocaleString(uiLocale());

/**
 * "1 familj" and "2 familjer" — the count with the right form of its noun.
 * Swedish, German and Spanish all inflect these, so composing the sentence from
 * a singular and a plural key is the only way to avoid writing "1 sources".
 */
export const plural = (n: number, oneKey: string, manyKey: string): string =>
  `${n} ${t(n === 1 ? oneKey : manyKey)}`;

export const eventLabel = (type: string): string =>
  EVENT_LABELS[current][type] ?? EVENT_LABELS.en[type] ?? type;

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

/** "15 Apr 1942" · "Apr 1942" · "1942" · "" — in the current language. */
function displayParts({ day, month, year }: DateParts): string {
  if (year === null) return '';
  if (month === null) return String(year);
  const name = MONTHS[current][month - 1]!;
  return day === null ? `${name} ${year}` : `${day} ${name} ${year}`;
}

/**
 * Word by word, for a date the model cannot hold — the seven rows with a
 * qualifier nested inside a range — and for text that is not a date at all.
 * Anything unrecognised comes through untouched, so nothing disappears from
 * the page just because the app does not understand it.
 */
function translateTokens(raw: string): string {
  const months = MONTHS[current];
  const q = QUALIFIERS[current];
  return raw.trim().split(/\s+/).map(token => {
    const upper = token.toUpperCase();
    // Any language's month name, so "6 aug." reads as a date and not as debris.
    const month = monthNumber(token);
    if (month !== null) return months[month - 1]!;
    if (upper === 'ABT' || upper === 'EST' || upper === 'CAL') return q.about;
    if (upper === 'BEF') return q.before;
    if (upper === 'AFT') return q.after;
    if (upper === 'AND') return q.and;
    if (upper === 'BET') return q.between;
    if (upper === 'FROM') return q.from;
    if (upper === 'TO') return q.to;
    return token;
  }).join(' ');
}

/** GEDCOM date → readable in the current language, e.g. "15 APR 1942". */
export function formatGedcomDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const date = parseGedcomDate(raw);
  if (!date) return translateTokens(raw);

  const q = QUALIFIERS[current];
  const from = displayParts(date.from);
  const to = date.to ? displayParts(date.to) : '';

  switch (date.qualifier) {
    case 'exact': return from;
    case 'about': case 'estimated': case 'calculated': return `${q.about} ${from}`;
    case 'before': return `${q.before} ${from}`;
    case 'after': return `${q.after} ${from}`;
    case 'between': return `${q.between} ${from} ${q.and} ${to}`;
    case 'period':
      if (from && to) return `${q.from} ${from} ${q.to} ${to}`;
      return from ? `${q.from} ${from}` : `${q.to} ${to}`;
  }
}
