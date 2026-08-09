import fs from 'node:fs';
import path from 'node:path';

/**
 * e2e must never mutate the real family data.
 *
 * The database runs from a fresh copy, imported trees get a throwaway
 * directory, and photos get a directory of **symlinks** to the real files: the
 * suite can read every downloaded photo, while anything it uploads lands in the
 * copy. Symlinks rather than a copy because the real folder is close to a
 * gigabyte.
 */
export default function globalSetup() {
  fs.rmSync('.e2e', { recursive: true, force: true });
  fs.mkdirSync('.e2e', { recursive: true });

  // Named wedin.db, in a directory of its own: a tree's id comes from its
  // filename, so this is what makes the suite walk the same `/wedin/...`
  // addresses the app really uses.
  //
  // The -wal has to come too. In WAL mode the newest writes live there and not
  // in the .db, so copying the one file alone hands the suite a stale database
  // — recent edits simply missing, for no visible reason.
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(`wedin.db${suffix}`)) fs.copyFileSync(`wedin.db${suffix}`, `.e2e/wedin.db${suffix}`);
  }

  fs.mkdirSync('.e2e/media', { recursive: true });
  if (fs.existsSync('media')) {
    for (const name of fs.readdirSync('media')) {
      fs.symlinkSync(path.resolve('media', name), path.join('.e2e/media', name));
    }
  }
}
