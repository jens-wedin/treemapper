import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, events } from '../db/schema';
import { createIssuesApi } from './issues';
import { createMergeApi } from './merge';
import type { Hono } from 'hono';

let db: Db;
let api: Hono;
let mergeApi: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  api = createIssuesApi(db);
  mergeApi = createMergeApi(db);
  // två personer med tydliga problem
  db.insert(persons).values([
    { id: 'I1', givenName: 'Fel', surname: 'Person', sex: 'M' },
    { id: 'I2', givenName: 'Utan', surname: 'Födelse', sex: 'F' },
  ]).run();
  db.insert(events).values([
    { id: 1, ownerType: 'person', ownerId: 'I1', type: 'BIRT', dateRaw: '1801', dateYear: 1801 },
    { id: 2, ownerType: 'person', ownerId: 'I1', type: 'DEAT', dateRaw: '1800', dateYear: 1800 },
  ]).run();
});

const post = (a: Hono, url: string, body: unknown) =>
  a.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('GET /api/issues', () => {
  it('returnerar problem värst först med kategorisummor', async () => {
    const res = await api.request('/api/issues');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].severity).toBe('error');
    expect(body.counts['Födsel efter bortgång']).toBe(1);
    expect(body.counts['Saknar födelse']).toBe(1);
    expect(body.total).toBeGreaterThan(1);
    expect(body.dismissed).toBe(0);
  });

  it('filtrerar på kategori', async () => {
    const res = await api.request('/api/issues?category=' + encodeURIComponent('Saknar födelse'));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].personIds[0]).toBe('I2');
  });
});

describe('avfärdande', () => {
  it('döljer avfärdade problem och kan återställa dem', async () => {
    const first = (await (await api.request('/api/issues')).json()).items[0];

    const dismiss = await post(api, '/api/issues/dismiss', { fingerprint: first.fingerprint, note: 'kollat' });
    expect(dismiss.status).toBe(200);

    const after = await (await api.request('/api/issues')).json();
    expect(after.items.some((i: { fingerprint: string }) => i.fingerprint === first.fingerprint)).toBe(false);
    expect(after.dismissed).toBe(1);

    const withDismissed = await (await api.request('/api/issues?includeDismissed=1')).json();
    const found = withDismissed.items.find((i: { fingerprint: string }) => i.fingerprint === first.fingerprint);
    expect(found.dismissed).toBe(true);

    const undo = await api.request(`/api/issues/dismiss/${first.fingerprint}`, { method: 'DELETE' });
    expect(undo.status).toBe(200);
    const restored = await (await api.request('/api/issues')).json();
    expect(restored.items.some((i: { fingerprint: string }) => i.fingerprint === first.fingerprint)).toBe(true);
  });
});

describe('POST /api/merge', () => {
  it('slår ihop två personer', async () => {
    const res = await post(mergeApi, '/api/merge', { survivorId: 'I1', duplicateId: 'I2' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.movedEvents).toBe(0);
    expect(db.select().from(persons).all().map(p => p.id)).toEqual(['I1']);
  });

  it('avvisar sammanslagning med sig själv på svenska', async () => {
    const res = await post(mergeApi, '/api/merge', { survivorId: 'I1', duplicateId: 'I1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('sig själv');
  });

  it('avvisar ogiltig indata', async () => {
    expect((await post(mergeApi, '/api/merge', { survivorId: 'I1' })).status).toBe(400);
  });
});
