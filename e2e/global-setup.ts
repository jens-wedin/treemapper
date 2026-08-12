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
  // The first-run project needs an empty directory and gets a new one every
  // time: it asserts what a clone of this repository looks like, and the tree
  // the previous run created would make it look like something else.
  fs.rmSync('.first-run', { recursive: true, force: true });
  fs.mkdirSync('.first-run', { recursive: true });

  fs.rmSync('.e2e', { recursive: true, force: true });
  fs.mkdirSync('.e2e/trees', { recursive: true });

  // Copied into a trees/ of its own, keeping the name wedin.db: a tree's id
  // comes from its filename, so this is what makes the suite walk the same
  // `/wedin/...` addresses the app really uses. It also mirrors the real
  // layout, where every family database — the default included — lives in
  // trees/, so the suite exercises the same paths the app resolves against.
  //
  // The -wal has to come too. In WAL mode the newest writes live there and not
  // in the .db, so copying the one file alone hands the suite a stale database
  // — recent edits simply missing, for no visible reason.
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(`trees/wedin.db${suffix}`)) {
      fs.copyFileSync(`trees/wedin.db${suffix}`, `.e2e/trees/wedin.db${suffix}`);
    }
  }

  // Mirrors the real layout, one folder per tree, because that is what the app
  // resolves against — photos loose in the root would simply not be found.
  fs.mkdirSync('.e2e/media', { recursive: true });
  if (fs.existsSync('media')) {
    for (const entry of fs.readdirSync('media', { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join('.e2e/media', entry.name);
      fs.mkdirSync(dir, { recursive: true });
      for (const name of fs.readdirSync(path.join('media', entry.name))) {
        fs.symlinkSync(path.resolve('media', entry.name, name), path.join(dir, name));
      }
    }
  }
}
