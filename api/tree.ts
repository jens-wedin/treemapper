import { Hono } from 'hono';
import { z } from 'zod';
import { getTree } from '../lib/tree';
import type { TreeResolver } from './trees';

const querySchema = z.object({
  // Ancestors go deeper than descendants: the fan chart wants 6–8 generations.
  up: z.coerce.number().int().min(0).max(8).default(3),
  down: z.coerce.number().int().min(0).max(5).default(3),
});

export function createTreeApi(activeTree: TreeResolver) {
  const api = new Hono();

  api.get('/api/tree/:id', c => {
    const { db } = activeTree(c);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Ogiltiga parametrar' }, 400);
    const tree = getTree(db, c.req.param('id'), parsed.data.up, parsed.data.down);
    return tree ? c.json(tree) : c.json({ error: 'Personen finns inte' }, 404);
  });

  return api;
}
