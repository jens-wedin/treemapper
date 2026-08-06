import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { searchPersons, getPersonFull } from '../lib/queries';

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  birthYear: z.coerce.number().int().min(100).max(2200).optional(),
  place: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function createPersonsApi(db: Db) {
  const api = new Hono();

  api.get('/api/persons', c => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Ogiltiga sökparametrar' }, 400);
    const { q, birthYear, place, limit, offset } = parsed.data;
    return c.json(searchPersons(db, { q: q || undefined, birthYear, place: place || undefined, limit, offset }));
  });

  api.get('/api/persons/:id/full', c => {
    const full = getPersonFull(db, c.req.param('id'));
    return full ? c.json(full) : c.json({ error: 'Personen finns inte' }, 404);
  });

  return api;
}
