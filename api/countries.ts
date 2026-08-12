import { Hono } from 'hono';
import { z } from 'zod';
import { countryName } from '../lib/places';
import { countryProposals, applyCountry, rejectCountry } from '../lib/countryProposals';
import type { TreeResolver } from './trees';

/**
 * Country inferences waiting to be approved or turned down.
 *
 * The responses carry a code and the numbers behind it — never a sentence.
 * `src/lib/countryText.ts` does the wording, which is what lets the same
 * proposal read in four languages.
 */

/** A place string can be long: five levels plus a note is normal in this data. */
const MAX_PLACE = 400;
const MAX_PLACES_PER_REQUEST = 4000;

const decisionSchema = z.object({
  places: z.array(z.string().trim().min(1).max(MAX_PLACE)).min(1).max(MAX_PLACES_PER_REQUEST),
  code: z.string().trim().length(2).toUpperCase(),
});

export function createCountriesApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/countries', c => {
    const { db } = tree(c);
    return c.json(countryProposals(db));
  });

  api.post('/api/countries/apply', async c => {
    const { db } = tree(c);
    const parsed = decisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);

    const { places, code } = parsed.data;
    // Refused rather than ignored: a code with no Swedish name would write
    // nothing, and a silent no-op reads exactly like a successful approval.
    if (!countryName(code)) return c.json({ error: `Unknown country code: ${code}` }, 400);

    let changed = 0;
    for (const place of places) changed += applyCountry(db, place, code);
    // The `{ ok, warnings, data }` envelope every mutation here uses, because
    // `mutateJson` casts the body to that shape rather than wrapping it — a
    // bare `{ changed }` reads back as `undefined` in the browser.
    return c.json({ ok: true, warnings: [], data: { changed } });
  });

  api.post('/api/countries/reject', async c => {
    const { db } = tree(c);
    const parsed = decisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);

    rejectCountry(db, parsed.data.places, parsed.data.code);
    return c.json({ ok: true, warnings: [], data: { rejected: parsed.data.places.length } });
  });

  return api;
}
