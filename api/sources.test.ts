import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { auditLog } from '../db/schema';
import { createSourcesApi } from './sources';
import type { Hono } from 'hono';

let dir: string;
let db: Db;
let api: Hono;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-src-api-'));
  const dbPath = path.join(dir, 'a.db');
  runImport(fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url)), dbPath);
  db = createDb(dbPath);
  api = createSourcesApi(db);
});

const patch = (url: string, body: unknown) =>
  api.request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('GET /api/sources', () => {
  it('listar och söker källor', async () => {
    const res = await api.request('/api/sources');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].citationCount).toBe(2);

    const search = await (await api.request('/api/sources?q=Hälsingland')).json();
    expect(search.total).toBe(1);
  });
});

describe('GET /api/sources/:id/full', () => {
  it('returnerar källan med hänvisningar', async () => {
    const body = await (await api.request('/api/sources/S1/full')).json();
    expect(body.source.title).toBe('Kyrkbok Hälsingland');
    expect(body.citations).toHaveLength(2);
  });

  it('404 på svenska för okänd källa', async () => {
    const res = await api.request('/api/sources/S999/full');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Källan finns inte');
  });
});

describe('PATCH /api/sources/:id', () => {
  it('uppdaterar och loggar ändringen', async () => {
    const res = await patch('/api/sources/S1', { title: 'Ny titel', author: null });
    expect(res.status).toBe(200);
    const body = await (await api.request('/api/sources/S1/full')).json();
    expect(body.source.title).toBe('Ny titel');
    expect(body.source.author).toBeNull();

    const log = db.select().from(auditLog).all().at(-1)!;
    expect(log).toMatchObject({ action: 'update', entityType: 'source', entityId: 'S1' });
    expect(JSON.parse(log.before!).title).toBe('Kyrkbok Hälsingland');
  });

  it('404 för okänd källa och 400 för ogiltiga fält', async () => {
    expect((await patch('/api/sources/S999', { title: 'x' })).status).toBe(404);
    expect((await patch('/api/sources/S1', { title: 'x'.repeat(300) })).status).toBe(400);
  });
});
