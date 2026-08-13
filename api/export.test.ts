import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons } from '../db/schema';
import { createExportApi } from './export';
import type { Hono } from 'hono';
import { fixedTree } from './trees';

let db: Db;
let api: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  db.insert(persons).values({ id: 'I1', givenName: 'Anders', surname: 'Testsson', sex: 'M' }).run();
  api = createExportApi(fixedTree(db));
});

describe('GET /api/export/gedcom', () => {
  it('serves a GEDCOM file the browser will download', async () => {
    const res = await api.request('/api/export/gedcom');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="treemapper-\d{4}-\d{2}-\d{2}\.ged"/);
    const text = await res.text();
    expect(text.replace(/^﻿/, '').startsWith('0 HEAD')).toBe(true);
    expect(text.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(text).toContain('0 @I1@ INDI');
  });

  it('exports 7.0 by default and honours an explicit ?format', async () => {
    expect(await (await api.request('/api/export/gedcom')).text()).toContain('2 VERS 7.0');            // default
    expect(await (await api.request('/api/export/gedcom?format=7.0')).text()).toContain('2 VERS 7.0'); // explicit
    expect(await (await api.request('/api/export/gedcom?format=5.5.1')).text()).toContain('2 VERS 5.5.1'); // override
  });
});
