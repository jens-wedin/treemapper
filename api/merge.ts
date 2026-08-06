import { Hono } from 'hono';
import type { Db } from '../db/client';
import { mergeSchema } from '../lib/schemas';
import { MutationError } from '../lib/mutations';
import { mergePersons } from '../lib/merge';

export function createMergeApi(db: Db) {
  const api = new Hono();

  api.post('/api/merge', async c => {
    const parsed = mergeSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    try {
      const { warnings, data } = mergePersons(db, parsed.data);
      return c.json({ ok: true, warnings, data });
    } catch (e) {
      if (e instanceof MutationError) return c.json({ error: e.message }, e.status);
      throw e;
    }
  });

  return api;
}
