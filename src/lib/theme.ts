import { useSyncExternalStore } from 'react';
import { readPreference } from './storage';

export type Theme = 'light' | 'dark' | 'system';
export type Resolved = 'light' | 'dark';

export const THEMES: Theme[] = ['system', 'light', 'dark'];
const STORAGE_KEY = 'wedin-tree-theme';
const LEGACY_KEY = 'wedin-tree-tema';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Anything unrecognised — including nothing stored — means "follow the OS". */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/** Which of the two palettes a choice actually means right now. */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): Resolved {
  return theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches;
}

function read(): Theme {
  return parseTheme(readPreference(STORAGE_KEY, LEGACY_KEY));
}

let current: Theme = typeof window === 'undefined' ? 'system' : read();
const listeners = new Set<() => void>();

/** Tailwind's dark variant keys off this class on <html>. */
function apply() {
  if (typeof document === 'undefined') return;
  const dark = resolveTheme(current, systemPrefersDark()) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(next: Theme) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* a preference is a nicety — ignore storage failures */
  }
  apply();
  listeners.forEach(notify => notify());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Re-renders on a theme change, the way useLanguage does for language. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

/**
 * Applies the stored choice and keeps following the OS while the choice is
 * "system" — someone switching their laptop to night mode should see this
 * follow without reloading.
 */
export function startTheme() {
  if (typeof window === 'undefined') return;
  apply();
  window.matchMedia?.(DARK_QUERY).addEventListener('change', () => {
    if (current === 'system') {
      apply();
      listeners.forEach(notify => notify());
    }
  });
}
