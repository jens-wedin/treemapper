import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { getStatistics } from '../lib/statistics';

const querySchema = z.object({
  // Absent means the whole database; present but empty is a mistake worth reporting.
  person: z.string().min(1).optional(),
});

export function createStatisticsApi(db: Db) {
  const api = new Hono();

  api.get('/api/statistics', c => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Ogiltiga parametrar' }, 400);
    const data = getStatistics(db, parsed.data.person);
    return data ? c.json(data) : c.json({ error: 'Personen finns inte' }, 404);
  });

  return api;
}
