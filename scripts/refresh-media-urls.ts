import fs from 'node:fs';
import { refreshMediaUrls } from '../lib/refreshMedia';

const gedPath = process.argv[2];
if (!gedPath || !fs.existsSync(gedPath)) {
  console.error('Usage: npm run refresh-media -- data/<fresh-export>.ged [db-path]');
  process.exit(2);
}
const dbPath = process.argv[3] ?? 'wedin.db';

const result = refreshMediaUrls(gedPath, dbPath);
console.log(`Refreshed URLs for ${result.matched} of ${result.total} photos — run npm run media to download them.`);
if (result.unmatched.length) {
  console.log(`${result.unmatched.length} photos with no match in the new export:`);
  for (const u of result.unmatched.slice(0, 20)) console.log(`  ✗ media ${u.id}`);
  if (result.unmatched.length > 20) console.log(`  … och ${result.unmatched.length - 20} till`);
}
