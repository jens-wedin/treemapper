import { Hono } from 'hono';
import { z } from 'zod';
import { getStatistics } from '../lib/statistics';
import type { TreeResolver } from './trees';

const querySchema = z.object({
  // Absent means the whole database; present but empty is a mistake worth reporting.
  person: z.string().min(1).optional(),
});

export function createStatisticsApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/statistics', c => {
    const { db } = tree(c);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Invalid parameters' }, 400);
    const data = getStatistics(db, parsed.data.person);
    return data ? c.json(data) : c.json({ error: 'That person does not exist' }, 404);
  });

  return api;
}
