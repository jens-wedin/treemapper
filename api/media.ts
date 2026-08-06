import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { media } from '../db/schema';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff',
};

export function createMediaApi(db: Db, mediaDir = 'media') {
  const api = new Hono();

  api.get('/api/media/:id', c => {
    const id = Number(c.req.param('id'));
    const row = Number.isInteger(id)
      ? db.select().from(media).where(eq(media.id, id)).all()[0]
      : undefined;
    if (!row || row.downloadStatus !== 'done' || !row.localPath) return c.json({ error: 'Hittades inte' }, 404);
    // localPath comes from our own downloader; basename() guards regardless
    const filePath = path.resolve(mediaDir, path.basename(row.localPath));
    if (!fs.existsSync(filePath)) return c.json({ error: 'Hittades inte' }, 404);
    return c.body(fs.readFileSync(filePath), 200, {
      'Content-Type': MIME[row.form ?? ''] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  return api;
}
