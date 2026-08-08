import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '../db/client';
import { DEFAULT_TREE, TreeNotFound, createTree, deleteTree, listTrees, openTree, renameTree } from '../lib/trees';
import { parseGedcom } from '../lib/gedcom/parser';

export interface ActiveTree { id: string; db: Db }

/**
 * Which tree a request is about.
 *
 * The id rides along as `?tree=<id>` rather than a header, because the GEDCOM
 * export is a plain download link and a link cannot set headers. Keeping it in
 * the request — rather than in a server-wide "current tree" — is what makes two
 * tabs, a reload and the serial e2e suite all behave.
 */
export type TreeResolver = (c: Context) => ActiveTree;

export function treeResolver(): TreeResolver {
  return c => {
    const id = c.req.query('tree') || DEFAULT_TREE;
    try {
      return { id, db: openTree(id) };
    } catch (err) {
      if (err instanceof TreeNotFound) {
        // Carries the id so the client can fall back to the default tree and
        // say which one went missing.
        throw new HTTPException(404, { res: c.json({ error: err.message, unknownTree: id }, 404) });
      }
      throw err;
    }
  };
}

/** For tests and any caller that already holds the database it means. */
export const fixedTree = (db: Db, id = DEFAULT_TREE): TreeResolver => () => ({ id, db });

/** Real exports run about 5 MB; this is a ceiling, not a target. */
export const MAX_UPLOAD = 50 * 1024 * 1024;

export function createTreesApi() {
  const api = new Hono();

  api.get('/api/trees', c => c.json({ trees: listTrees() }));

  api.post(
    '/api/trees/import',
    bodyLimit({
      maxSize: MAX_UPLOAD,
      onError: c => c.json({ error: 'Filen är för stor — högst 50 MB' }, 413),
    }),
    async c => {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!(file instanceof File) || !file.size) return c.json({ error: 'Ingen fil vald' }, 400);

      const given = typeof body['name'] === 'string' ? body['name'].trim() : '';
      const name = given || file.name.replace(/\.ged$/i, '');
      const tmp = path.join(os.tmpdir(), `wedin-import-${Date.now()}.ged`);
      fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));

      try {
        // Read before anything is created. A file that is not a GEDCOM either
        // fails to parse or holds no people; neither would stop the import on
        // its own, so it would quietly produce an empty tree — a much more
        // confusing thing to be handed than a refusal.
        let hasPeople: boolean;
        try {
          hasPeople = parseGedcom(fs.readFileSync(tmp, 'utf-8'), []).some(r => r.tag === 'INDI');
        } catch {
          hasPeople = false;   // unreadable is the same answer as empty, to the person uploading
        }
        if (!hasPeople) {
          return c.json({ error: 'Filen innehåller inga personer — är det verkligen en GEDCOM-fil?' }, 400);
        }
        const { tree, summary } = createTree(name, tmp, file.name);
        return c.json({ ok: true, tree, summary });
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
  );

  api.patch('/api/trees/:id', async c => {
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name : '';
    try {
      return c.json({ ok: true, tree: renameTree(c.req.param('id'), name) });
    } catch (err) {
      return c.json({ error: (err as Error).message }, err instanceof TreeNotFound ? 404 : 400);
    }
  });

  api.delete('/api/trees/:id', c => {
    try {
      deleteTree(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, err instanceof TreeNotFound ? 404 : 400);
    }
  });

  return api;
}
