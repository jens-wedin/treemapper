import { Hono } from 'hono';
import type { Db } from '../db/client';
import { exportGedcom } from '../lib/gedcomExport';

export function createExportApi(db: Db) {
  const api = new Hono();

  api.get('/api/export/gedcom', c => {
    const stamp = new Date().toISOString().slice(0, 10);
    return c.body(exportGedcom(db), 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="wedin-tree-${stamp}.ged"`,
    });
  });

  return api;
}
