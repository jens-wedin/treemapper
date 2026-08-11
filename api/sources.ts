import { Hono } from 'hono';
import { z } from 'zod';
import { listSources, getSourceFull } from '../lib/sources';
import { sourceUpdateSchema } from '../lib/schemas';
import { MutationError, createSource, deleteSource, updateSource } from '../lib/mutations';
import type { TreeResolver } from './trees';

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function createSourcesApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/sources', c => {
    const { db } = tree(c);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Ogiltiga sökparametrar' }, 400);
    const { q, limit, offset } = parsed.data;
    return c.json(listSources(db, { q: q || undefined, limit, offset }));
  });

  api.get('/api/sources/:id/full', c => {
    const { db } = tree(c);
    const full = getSourceFull(db, c.req.param('id'));
    return full ? c.json(full) : c.json({ error: 'Källan finns inte' }, 404);
  });

  api.post('/api/sources', async c => {
    const { db } = tree(c);
    const parsed = sourceUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    try {
      return c.json({ ok: true, ...createSource(db, parsed.data) });
    } catch (err) {
      if (err instanceof MutationError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  api.delete('/api/sources/:id', c => {
    const { db } = tree(c);
    // Removing the citations too is asked for in the URL rather than assumed:
    // a plain DELETE refuses and reports how many records would lose their
    // evidence, so the count is seen before it is agreed to.
    const withCitations = c.req.query('citations') === 'remove';
    try {
      return c.json({ ok: true, ...deleteSource(db, c.req.param('id'), { withCitations }) });
    } catch (err) {
      if (err instanceof MutationError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  api.patch('/api/sources/:id', async c => {
    const { db } = tree(c);
    const parsed = sourceUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    try {
      const { warnings, data } = updateSource(db, c.req.param('id'), parsed.data);
      return c.json({ ok: true, warnings, data });
    } catch (e) {
      if (e instanceof MutationError) return c.json({ error: e.message }, e.status);
      throw e;
    }
  });

  return api;
}
