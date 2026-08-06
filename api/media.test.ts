import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/client';
import { media } from '../db/schema';
import { createMediaApi } from './media';
import type { Hono } from 'hono';

let dir: string;
let api: Hono;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-media-api-'));
  const db = createDb(path.join(dir, 'm.db'));
  const mediaDir = path.join(dir, 'media');
  fs.mkdirSync(mediaDir);
  fs.writeFileSync(path.join(mediaDir, '1.jpg'), Buffer.from('JPEGDATA'));
  db.insert(media).values([
    { id: 1, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://x/1.jpg', form: 'jpg', downloadStatus: 'done', localPath: 'media/1.jpg' },
    { id: 2, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://x/2.jpg', downloadStatus: 'failed' },
  ]).run();
  api = createMediaApi(db, mediaDir);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('GET /api/media/:id', () => {
  it('serves a downloaded file with content-type and cache headers', async () => {
    const res = await api.request('/api/media/1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('JPEGDATA');
  });

  it('404s for not-downloaded, unknown, and non-numeric ids', async () => {
    expect((await api.request('/api/media/2')).status).toBe(404);
    expect((await api.request('/api/media/99')).status).toBe(404);
    expect((await api.request('/api/media/abc')).status).toBe(404);
  });
});
