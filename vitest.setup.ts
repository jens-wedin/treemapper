import os from 'node:os';
import path from 'node:path';

/**
 * No unit test may open the real family database.
 *
 * `lib/trees.ts` falls back to `wedin.db` when `WEDIN_DB` is unset, which is
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
  WEDIN_DB: path.join(scratch, 'wedin.db'),
  WEDIN_TREES_DIR: path.join(scratch, 'trees'),
  WEDIN_MEDIA_DIR: path.join(scratch, 'media'),
};

for (const [key, value] of Object.entries(SAFE_ENV)) process.env[key] = value;
