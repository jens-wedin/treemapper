import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { createDb, type Db } from '../db/client';
import { events, persons } from '../db/schema';
import { fixedTree } from './trees';
import { createCountriesApi } from './countries';

let db: Db;
let api: Hono;
let nextEventId = 0;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-countries-api-'));
  db = createDb(path.join(dir, 'a.db'));
  nextEventId = 0;
  db.insert(persons).values({ id: 'I1', givenName: 'Test', surname: 'Person' }).run();
  api = createCountriesApi(fixedTree(db));
});

function place(text: string, times = 1) {
  for (let i = 0; i < times; i++) {
    db.insert(events).values({
      id: ++nextEventId, ownerType: 'person', ownerId: 'I1', type: 'RESI', place: text,
    }).run();
  }
}

const post = (url: string, body: unknown) =>
  api.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const placesNow = () => db.select().from(events).all().map(e => e.place);

describe('GET /api/countries', () => {
  it('returns the groups, the quarantine and what it left alone', async () => {
    place('Bjuråker, Sverige', 2);
    place('Bjuråker');
    place('Ouagadougou');

    const res = await api.request('/api/countries');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.learned).toHaveLength(1);
    expect(body.learned[0]).toMatchObject({ code: 'SE', by: 'bjuråker', places: 1, rows: 1 });
    expect(body.quarantined).toEqual([]);
    expect(body.unanswered).toBe(1);
  });

  it('sends a code and its numbers, never a finished sentence', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    const body = await (await api.request('/api/countries')).json();
    const group = body.learned[0];
    expect(Object.keys(group).sort()).toEqual(
      ['by', 'code', 'examples', 'members', 'places', 'rows', 'tier', 'weight'],
    );
  });

  it('separates what the record already said from what was inferred', async () => {
    place('Tobyn, Manskog, Varmland, Sweden.');

    const body = await (await api.request('/api/countries')).json();
    expect(body.stated).toHaveLength(1);
    expect(body.stated[0].after).toBe('Tobyn, Manskog, Varmland, Sverige');
    expect(body.learned).toEqual([]);
  });
});

describe('POST /api/countries/apply', () => {
  it('writes the country into every event carrying the place', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker', 3);

    const res = await post('/api/countries/apply', { places: ['Bjuråker'], code: 'SE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, warnings: [], data: { changed: 3 } });
    expect(placesNow().filter(p => p === 'Bjuråker, Sverige')).toHaveLength(4);
  });

  it('applies every place in a group in one request', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');
    place('Bjuråker Strömbacka');

    const res = await post('/api/countries/apply', {
      places: ['Bjuråker', 'Bjuråker Strömbacka'], code: 'SE',
    });
    expect((await res.json()).data.changed).toBe(2);
    expect(placesNow()).toContain('Bjuråker Strömbacka, Sverige');
  });

  it('changes nothing the second time', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    await post('/api/countries/apply', { places: ['Bjuråker'], code: 'SE' });
    const again = await post('/api/countries/apply', { places: ['Bjuråker'], code: 'SE' });
    expect(await again.json()).toEqual({ ok: true, warnings: [], data: { changed: 0 } });
  });

  it('refuses a country code it does not know', async () => {
    place('Bjuråker');
    const res = await post('/api/countries/apply', { places: ['Bjuråker'], code: 'QQ' });
    expect(res.status).toBe(400);
  });

  it('refuses a request with no places', async () => {
    const res = await post('/api/countries/apply', { places: [], code: 'SE' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/countries/reject', () => {
  it('keeps the inference from being offered again', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    const res = await post('/api/countries/reject', { places: ['Bjuråker'], code: 'SE' });
    expect(res.status).toBe(200);

    const body = await (await api.request('/api/countries')).json();
    expect(body.learned).toEqual([]);
  });

  it('leaves the place text exactly as it was', async () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    await post('/api/countries/reject', { places: ['Bjuråker'], code: 'SE' });
    expect(placesNow()).toContain('Bjuråker');
  });
});
