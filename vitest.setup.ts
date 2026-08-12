import os from 'node:os';
import path from 'node:path';

/**
 * No unit test may open the real family database.
 *
 * `lib/trees.ts` falls back to `wedin.db` when `TREEMAPPER_DB` is unset, which is
 * right in production and dangerous in a test run: vitest shares `process.env`
 * between the files running in one worker, so a test file that clears the
 * variable in its teardown exposes every other file's fallback — and the
 * fallback is the family's actual data.
 *
 * Pointing the variables at a scratch directory before any test runs makes that
 * fallback harmless. Tests that set their own paths restore these afterwards
 * rather than deleting them.
 */
const scratch = path.join(os.tmpdir(), 'wedin-vitest');

export const SAFE_ENV = {
  TREEMAPPER_DB: path.join(scratch, 'wedin.db'),
  TREEMAPPER_TREES_DIR: path.join(scratch, 'trees'),
  TREEMAPPER_MEDIA_DIR: path.join(scratch, 'media'),
};

for (const [key, value] of Object.entries(SAFE_ENV)) process.env[key] = value;

/**
 * A `localStorage` for the node environment.
 *
 * Every preference the app stores is wrapped in a try/catch, so without this
 * the storage tests would pass by never reaching storage at all — the catch
 * would swallow the missing global and hand back the default. Node has a real
 * implementation behind `--localstorage-file`, but it persists to disk between
 * runs, which is the opposite of what a test wants.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
  });
}
