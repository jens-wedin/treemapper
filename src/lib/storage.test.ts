import { describe, it, expect, beforeEach } from 'vitest';
import { readPreference, writePreference } from './storage';

beforeEach(() => localStorage.clear());

describe('readPreference', () => {
  // The theme key has been renamed twice: `wedin-tree-tema` when the project
  // was Swedish, `wedin-tree-theme` when it moved to English, and
  // `treemapper-theme` when the app was named. Every browser in the chain has
  // to keep its setting.
  const THEME = ['treemapper-theme', 'wedin-tree-theme', 'wedin-tree-tema'] as const;

  it('reads the current key', () => {
    localStorage.setItem('treemapper-theme', 'dark');
    expect(readPreference(...THEME)).toBe('dark');
  });

  it('adopts a value still stored under the name before this one', () => {
    localStorage.setItem('wedin-tree-theme', 'dark');
    expect(readPreference(...THEME)).toBe('dark');
  });

  it('adopts a value from two renames ago', () => {
    // A browser last opened before the project moved to English. One legacy
    // argument used to be enough; after the second rename it was not.
    localStorage.setItem('wedin-tree-tema', 'dark');
    expect(readPreference(...THEME)).toBe('dark');
  });

  it('moves the value across, so the migration happens once', () => {
    localStorage.setItem('wedin-tree-tema', 'dark');
    readPreference(...THEME);
    expect(localStorage.getItem('treemapper-theme')).toBe('dark');
    expect(localStorage.getItem('wedin-tree-tema')).toBeNull();
  });

  it('prefers the current key when several are set', () => {
    // Two browsers, one upgraded: the newer choice is the one to keep.
    localStorage.setItem('treemapper-theme', 'light');
    localStorage.setItem('wedin-tree-tema', 'dark');
    expect(readPreference(...THEME)).toBe('light');
  });

  it('prefers the newer of two old names', () => {
    localStorage.setItem('wedin-tree-theme', 'light');
    localStorage.setItem('wedin-tree-tema', 'dark');
    expect(readPreference(...THEME)).toBe('light');
  });

  it('returns null when none of them is set', () => {
    expect(readPreference(...THEME)).toBeNull();
  });

  it('keeps an empty string, which is a stored value like any other', () => {
    localStorage.setItem('wedin-tree-active-tree', '');
    expect(readPreference('treemapper-active-tree', 'wedin-tree-active-tree')).toBe('');
  });
});


describe('writePreference', () => {
  it('stores the value', () => {
    writePreference('treemapper-language', 'sv');
    expect(localStorage.getItem('treemapper-language')).toBe('sv');
  });
});
