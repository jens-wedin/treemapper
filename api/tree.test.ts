import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb } from '../db/client';
import { createTreeApi } from './tree';
import type { Hono } from 'hono';

let dir: string;
let api: Hono;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-tree-api-'));
  const dbPath = path.join(dir, 'a.db');
  runImport(fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url)), dbPath);
  api = createTreeApi(createDb(dbPath));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('GET /api/tree/:id', () => {
  it('returns the tree payload', async () => {
    const res = await api.request('/api/tree/I3?up=2&down=1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus.id).toBe('I3');
    expect(body.ancestors.parents).toHaveLength(2);
  });

  it('validates and 404s', async () => {
    expect((await api.request('/api/tree/I3?up=9')).status).toBe(400);   // förfäder max 8
    expect((await api.request('/api/tree/I3?down=6')).status).toBe(400); // ättlingar max 5
    expect((await api.request('/api/tree/I999')).status).toBe(404);
  });

  it('tillåter djupa förfäder för solfjädern', async () => {
    expect((await api.request('/api/tree/I3?up=8&down=0')).status).toBe(200);
  });
});
