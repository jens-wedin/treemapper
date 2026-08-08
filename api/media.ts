import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { eq } from 'drizzle-orm';
import { media } from '../db/schema';
import { mediaDirFor } from '../lib/trees';
import { MutationError } from '../lib/mutations';
import { addPhoto, MAX_PHOTO_BYTES, removePhoto } from '../lib/media';
import type { TreeResolver } from './trees';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff',
  webp: 'image/webp', tiff: 'image/tiff',
};

export function createMediaApi(tree: TreeResolver, dirFor = mediaDirFor) {
  const api = new Hono();

  api.get('/api/media/:id', c => {
    // Each tree keeps its photos in its own folder: media ids are per-database
    // integers, so two trees would otherwise both claim media/1.jpg.
    const { id: treeId, db } = tree(c);
    const mediaDir = dirFor(treeId);
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

  api.post(
    '/api/media',
    bodyLimit({
      maxSize: MAX_PHOTO_BYTES,
      onError: c => c.json({ error: 'Bilden är för stor — högst 25 MB' }, 413),
    }),
    async c => {
      const { id: treeId, db } = tree(c);
      const body = await c.req.parseBody();
      const file = body['file'];
      const ownerId = typeof body['ownerId'] === 'string' ? body['ownerId'] : '';
      const title = typeof body['title'] === 'string' && body['title'].trim() ? body['title'].trim() : null;
      if (!(file instanceof File)) return c.json({ error: 'Ingen fil vald' }, 400);

      try {
        const added = addPhoto(
          db,
          { ownerId, title, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
          dirFor(treeId),
        );
        return c.json({ ok: true, warnings: [], data: added });
      } catch (err) {
        if (err instanceof MutationError) return c.json({ error: err.message }, err.status);
        throw err;
      }
    },
  );

  api.delete('/api/media/:id', c => {
    const { db } = tree(c);
    try {
      removePhoto(db, Number(c.req.param('id')));
      return c.json({ ok: true, warnings: [], data: null });
    } catch (err) {
      if (err instanceof MutationError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  return api;
}
