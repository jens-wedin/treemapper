import fs from 'node:fs';
import { refreshMediaUrls } from '../lib/refreshMedia';

const gedPath = process.argv[2];
if (!gedPath || !fs.existsSync(gedPath)) {
  console.error('Användning: npm run refresh-media -- data/<färsk-export>.ged [db-sökväg]');
  process.exit(2);
}
const dbPath = process.argv[3] ?? 'wedin.db';

const result = refreshMediaUrls(gedPath, dbPath);
console.log(`Uppdaterade URL:er för ${result.matched} av ${result.total} media — kör npm run media för att ladda ner.`);
if (result.unmatched.length) {
  console.log(`${result.unmatched.length} media utan träff i den nya exporten:`);
  for (const u of result.unmatched.slice(0, 20)) console.log(`  ✗ media ${u.id}`);
  if (result.unmatched.length > 20) console.log(`  … och ${result.unmatched.length - 20} till`);
}
