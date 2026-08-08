import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { persons, families, sources, media } from '../db/schema';
import type { TreeResolver } from './trees';

export function createApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/stats', c => {
    const { db } = tree(c);
    const one = (q: { n: number }[]) => q[0]?.n ?? 0;
    return c.json({
      persons: one(db.select({ n: sql<number>`count(*)` }).from(persons).all()),
      families: one(db.select({ n: sql<number>`count(*)` }).from(families).all()),
      sources: one(db.select({ n: sql<number>`count(*)` }).from(sources).all()),
      media: one(db.select({ n: sql<number>`count(*)` }).from(media).all()),
      mediaDone: one(db.select({ n: sql<number>`count(*)` }).from(media).where(eq(media.downloadStatus, 'done')).all()),
    });
  });

  return api;
}
