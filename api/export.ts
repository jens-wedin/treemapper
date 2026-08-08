import { Hono } from 'hono';
import { exportGedcom } from '../lib/gedcomExport';
import type { TreeResolver } from './trees';

export function createExportApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/export/gedcom', c => {
    const { db } = tree(c);
    const stamp = new Date().toISOString().slice(0, 10);
    return c.body(exportGedcom(db), 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="wedin-tree-${stamp}.ged"`,
    });
  });

  return api;
}
