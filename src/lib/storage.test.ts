import { describe, it, expect, beforeEach } from 'vitest';
import { readPreference, writePreference } from './storage';

beforeEach(() => localStorage.clear());

describe('readPreference', () => {
  it('reads the current key', () => {
    localStorage.setItem('wedin-tree-theme', 'dark');
    expect(readPreference('wedin-tree-theme', 'wedin-tree-tema')).toBe('dark');
  });

  it('adopts a value still stored under the old Swedish key', () => {
    localStorage.setItem('wedin-tree-tema', 'dark');
    expect(readPreference('wedin-tree-theme', 'wedin-tree-tema')).toBe('dark');
  });

  it('moves the value across, so the migration happens once', () => {
    localStorage.setItem('wedin-tree-tema', 'dark');
    readPreference('wedin-tree-theme', 'wedin-tree-tema');
    expect(localStorage.getItem('wedin-tree-theme')).toBe('dark');
    expect(localStorage.getItem('wedin-tree-tema')).toBeNull();
  });

  it('prefers the current key when both are set', () => {
    // Two browsers, one upgraded: the newer choice is the one to keep.
    localStorage.setItem('wedin-tree-theme', 'light');
    localStorage.setItem('wedin-tree-tema', 'dark');
    expect(readPreference('wedin-tree-theme', 'wedin-tree-tema')).toBe('light');
  });

  it('returns null when neither key is set', () => {
    expect(readPreference('wedin-tree-theme', 'wedin-tree-tema')).toBeNull();
  });

  it('keeps an empty string, which is a stored value like any other', () => {
    localStorage.setItem('wedin-tree-active-tree', '');
    expect(readPreference('wedin-tree-active-tree', 'wedin-tree-trad')).toBe('');
  });
});

describe('writePreference', () => {
  it('stores the value', () => {
    writePreference('wedin-tree-language', 'sv');
    expect(localStorage.getItem('wedin-tree-language')).toBe('sv');
  });
});
