import { Hono } from 'hono';
import { exportGedcom } from '../lib/gedcomExport';
import { treeMeta } from '../db/schema';
import type { TreeResolver } from './trees';

export function createExportApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/export/gedcom', c => {
    const { db } = tree(c);
    const stored = db.select().from(treeMeta).all()[0]?.gedcomFormat;
    const q = c.req.query('format');
    const version: '5.5.1' | '7.0' = q === '5.5.1' || q === '7.0' ? q : (stored === '5.5.1' ? '5.5.1' : '7.0');
    const stamp = new Date().toISOString().slice(0, 10);
    return c.body(exportGedcom(db, { version }), 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="treemapper-${stamp}.ged"`,
    });
  });

  return api;
}
