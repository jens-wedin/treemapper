/**
 * Browser preferences, and the one-time move from their Swedish key names.
 *
 * The keys used to be `wedin-tree-tema`, `wedin-tree-sprak` and so on. Renaming
 * them to English would silently reset the theme, the language and the tree you
 * had open — the values are still there, just under names nothing reads any
 * more. So the first read after the rename looks under the old name too, moves
 * what it finds, and deletes the old key.
 *
 * The migration is worth keeping for a while, not forever: once every browser
 * that mattered has been opened once, the legacy argument can go.
 */

/**
 * The stored value for `key`, adopting the value of an older name if that is
 * where it still lives. Returns null when none of them is set.
 *
 * Variadic because the names have now been renamed twice — `wedin-tree-tema`
 * became `wedin-tree-theme` when the project moved to English, and that became
 * `treemapper-theme` when it was named. A single legacy argument would have
 * quietly dropped the oldest link in the chain.
 */
export function readPreference(key: string, ...legacyKeys: string[]): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current != null) return current;

    // Newest first, so a browser holding two old names adopts the later one.
    for (const legacyKey of legacyKeys) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy == null) continue;
      localStorage.setItem(key, legacy);
      localStorage.removeItem(legacyKey);
      return legacy;
    }
    return null;
  } catch {
    return null;   // storage unavailable — every caller has a default
  }
}

/** Stores a preference, ignoring a browser that refuses to keep it. */
export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a preference is a nicety — ignore storage failures */
  }
}
