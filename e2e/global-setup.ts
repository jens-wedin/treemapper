import fs from 'node:fs';

// e2e must never mutate the real family database — run against a fresh copy,
// and give imported trees a throwaway directory of their own so a test import
// cannot leave a tree behind in trees/.
export default function globalSetup() {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`.e2e.db${suffix}`, { force: true });
  if (fs.existsSync('wedin.db')) fs.copyFileSync('wedin.db', '.e2e.db');
  fs.rmSync('.e2e-trees', { recursive: true, force: true });
}
