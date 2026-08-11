import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb } from '../db/client';
import { createMutationsApi } from './mutations';
import type { Hono } from 'hono';
import { fixedTree } from './trees';

let dir: string;
let api: Hono;

const post = (url: string, body: unknown) =>
  api.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url: string, body: unknown) =>
  api.request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-mut-api-'));
  const dbPath = path.join(dir, 'a.db');
  runImport(fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url)), dbPath);
  api = createMutationsApi(fixedTree(createDb(dbPath)));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('PATCH /api/persons/:id', () => {
  it('updates a person', async () => {
    const res = await patch('/api/persons/I1', { marriedName: 'Testnamn' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, warnings: [] });
  });

  it('404s for unknown persons and 400s on invalid bodies', async () => {
    expect((await patch('/api/persons/I999', {})).status).toBe(404);
    expect((await patch('/api/persons/I1', { sex: 'X' })).status).toBe(400);
  });
});

describe('event endpoints', () => {
  it('creates, surfaces date warnings, updates and deletes', async () => {
    const created = await post('/api/events', {
      type: 'OCCU', ownerType: 'person', ownerId: 'I1',
      dateRaw: 'okänt datum', place: null, description: 'API-yrke', age: null,
    });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.warnings[0]).toContain('could not be read');
    const id = body.data.id;

    expect((await patch(`/api/events/${id}`, { place: 'Sundsvall' })).status).toBe(200);
    expect((await api.request(`/api/events/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await api.request(`/api/events/${id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('400s on malformed event bodies', async () => {
    const res = await post('/api/events', { type: 'lower', ownerType: 'person', ownerId: 'I1', dateRaw: null, place: null, description: null, age: null });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Unknown event type');
  });
});

describe('POST /api/relations', () => {
  it('adds a child', async () => {
    const res = await post('/api/relations', {
      type: 'child', personId: 'I1', newPerson: { givenName: 'API', surname: 'Barn', sex: 'M' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ familyId: 'F1' });
  });

  it('rejects self-relations, saying why', async () => {
    const res = await post('/api/relations', { type: 'child', personId: 'I1', relativeId: 'I1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('their own relative');
  });
});
