import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, events } from '../db/schema';
import { createIssuesApi } from './issues';
import { updatePerson } from '../lib/mutations';
import { createMergeApi } from './merge';
import type { Hono } from 'hono';
import { fixedTree } from './trees';

let db: Db;
let api: Hono;
let mergeApi: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  api = createIssuesApi(fixedTree(db));
  mergeApi = createMergeApi(fixedTree(db));
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
  it('returns problems worst first, with a count per category', async () => {
    const res = await api.request('/api/issues');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].severity).toBe('error');
    expect(body.counts['death-before-birth']).toBe(1);
    expect(body.counts['missing-birth']).toBe(1);
    expect(body.total).toBeGreaterThan(1);
    expect(body.dismissed).toBe(0);
  });

  it('filters by category', async () => {
    const res = await api.request('/api/issues?category=' + encodeURIComponent('missing-birth'));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].personIds[0]).toBe('I2');
  });
});

describe('dismissing', () => {
  it('hides dismissed problems and can restore them', async () => {
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
  it('merges two people', async () => {
    const res = await post(mergeApi, '/api/merge', { survivorId: 'I1', duplicateId: 'I2' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.movedEvents).toBe(0);
    expect(db.select().from(persons).all().map(p => p.id)).toEqual(['I1']);
  });

  it('accepts empty and partial field choices, as the UI sends them', async () => {
    const empty = await post(mergeApi, '/api/merge', { survivorId: 'I1', duplicateId: 'I2', fieldChoices: {} });
    expect(empty.status).toBe(200);

    db.insert(persons).values([
      { id: 'I3', givenName: 'A', surname: 'X', sex: 'U' },
      { id: 'I4', givenName: 'B', surname: 'X', sex: 'U' },
    ]).run();
    const partial = await post(mergeApi, '/api/merge', {
      survivorId: 'I3', duplicateId: 'I4', fieldChoices: { givenName: 'duplicate' },
    });
    expect(partial.status).toBe(200);
    expect(db.select().from(persons).all().find(p => p.id === 'I3')!.givenName).toBe('B');
  });

  it('rejects invalid field choices', async () => {
    const res = await post(mergeApi, '/api/merge', {
      survivorId: 'I1', duplicateId: 'I2', fieldChoices: { givenName: 'neither' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects merging a record with itself', async () => {
    const res = await post(mergeApi, '/api/merge', { survivorId: 'I1', duplicateId: 'I1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('sig själv');
  });

  it('rejects invalid input', async () => {
    expect((await post(mergeApi, '/api/merge', { survivorId: 'I1' })).status).toBe(400);
  });
});

describe('GET /api/issues/persons', () => {
  it('gives a register of which people have problems', async () => {
    const res = await api.request('/api/issues/persons');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persons.I1.severity).toBe('error');
    const birthAfterDeath = body.persons.I1.problems
      .find((p: { code: string }) => p.code === 'death-before-birth');
    // the values behind the sentence come with it — the panel builds the words
    expect(birthAfterDeath.params).toMatchObject({ birth: 1801 });
    expect(birthAfterDeath.severity).toBe('error');
    expect(body.persons.I2.problems).toHaveLength(1);
    expect(body.persons.I2.severity).toBe('warning');
    expect(body.total).toBe(2);
  });

  it('leaves out what has been dismissed in Konsekvensbänken', async () => {
    const missingBirth = (await (await api.request('/api/issues?category=' + encodeURIComponent('missing-birth'))).json()).items[0];
    await post(api, '/api/issues/dismiss', { fingerprint: missingBirth.fingerprint });

    const body = await (await api.request('/api/issues/persons')).json();
    expect(body.persons.I2).toBeUndefined();
    expect(body.persons.I1).toBeDefined();
    expect(body.total).toBe(1);
  });
});

describe('the history in /api/issues', () => {
  it('lists both fixed and dismissed, newest first', async () => {
    updatePerson(db, 'I1', { givenName: 'Rättad' });
    const first = (await (await api.request('/api/issues')).json()).items[0];
    await post(api, '/api/issues/dismiss', { fingerprint: first.fingerprint, note: 'kollat' });

    const body = await (await api.request('/api/issues')).json();
    expect(body.log).toHaveLength(2);
    expect(body.log[0]).toMatchObject({ kind: 'dismissed', note: 'kollat' });
    expect(body.log[1]).toMatchObject({ kind: 'changed', personId: 'I1' });
    expect(body.log[1].changes[0].field).toBe('givenName');
  });

  it('is unaffected by the queue filters', async () => {
    updatePerson(db, 'I1', { givenName: 'Rättad' });
    const body = await (await api.request('/api/issues?severity=error')).json();
    expect(body.log).toHaveLength(1);
  });
});
