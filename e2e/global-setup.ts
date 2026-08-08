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
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`.e2e.db${suffix}`, { force: true });
  if (fs.existsSync('wedin.db')) fs.copyFileSync('wedin.db', '.e2e.db');

  fs.rmSync('.e2e-trees', { recursive: true, force: true });

  fs.rmSync('.e2e-media', { recursive: true, force: true });
  fs.mkdirSync('.e2e-media', { recursive: true });
  if (fs.existsSync('media')) {
    for (const name of fs.readdirSync('media')) {
      fs.symlinkSync(path.resolve('media', name), path.join('.e2e-media', name));
    }
  }
}
