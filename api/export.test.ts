import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons } from '../db/schema';
import { createExportApi } from './export';
import type { Hono } from 'hono';

let db: Db;
let api: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  db.insert(persons).values({ id: 'I1', givenName: 'Anders', surname: 'Testsson', sex: 'M' }).run();
  api = createExportApi(db);
});

describe('GET /api/export/gedcom', () => {
  it('levererar en nedladdningsbar GEDCOM-fil', async () => {
    const res = await api.request('/api/export/gedcom');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="wedin-tree-\d{4}-\d{2}-\d{2}\.ged"/);
    const text = await res.text();
    expect(text.replace(/^﻿/, '').startsWith('0 HEAD')).toBe(true);
    expect(text.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(text).toContain('0 @I1@ INDI');
  });
});
