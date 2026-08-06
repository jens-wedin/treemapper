import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb } from '../db/client';
import { createPersonsApi } from './persons';
import type { Hono } from 'hono';

let dir: string;
let api: Hono;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-api-'));
  const dbPath = path.join(dir, 'a.db');
  runImport(fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url)), dbPath);
  api = createPersonsApi(createDb(dbPath));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('GET /api/persons', () => {
  it('searches with query params', async () => {
    const res = await api.request('/api/persons?q=Sven-Erik&limit=10');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe('I1');
  });

  it('rejects invalid params', async () => {
    expect((await api.request('/api/persons?birthYear=abc')).status).toBe(400);
    expect((await api.request('/api/persons?limit=9999')).status).toBe(400);
  });
});

describe('GET /api/persons/:id/full', () => {
  it('returns the full payload', async () => {
    const res = await api.request('/api/persons/I1/full');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.givenName).toBe('Sven-Erik');
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('404s in Swedish for unknown persons', async () => {
    const res = await api.request('/api/persons/I999/full');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Personen finns inte');
  });
});
