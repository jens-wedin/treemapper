import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTreesApi, treeResolver } from './trees';
import { createPersonsApi } from './persons';
import { createDb } from '../db/client';
import { closeTrees, listTrees, openTree } from '../lib/trees';
import { SAFE_ENV } from '../vitest.setup';

const MINI = fs.readFileSync(path.resolve('lib/gedcom/fixtures/mini.ged'), 'utf-8');

let workDir: string;
let api: ReturnType<typeof createTreesApi>;

const upload = (contents: string, filename = 'mini.ged', name?: string) => {
  const form = new FormData();
  form.append('file', new File([contents], filename));
  if (name !== undefined) form.append('name', name);
  return api.request('/api/trees/import', { method: 'POST', body: form });
};

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-api-trees-'));
  process.env.TREEMAPPER_DB = path.join(workDir, 'wedin.db');
  process.env.TREEMAPPER_TREES_DIR = path.join(workDir, 'trees');
  process.env.TREEMAPPER_MEDIA_DIR = path.join(workDir, 'media');
  closeTrees();
  // The state an existing installation is in: wedin.db is on disk because an
  // import once made it. A clone of the repository has no such file — see the
  // "a fresh clone" block below.
  createDb(process.env.TREEMAPPER_DB!).$client.close();
  api = createTreesApi();
});

afterEach(() => {
  closeTrees();
  fs.rmSync(workDir, { recursive: true, force: true });
  // Restored, not deleted: unsetting them would let lib/trees.ts fall back
  // to the real wedin.db for any test file sharing this worker.
  Object.assign(process.env, SAFE_ENV);
});

describe('a fresh clone', () => {
  beforeEach(() => {
    closeTrees();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${process.env.TREEMAPPER_DB}${suffix}`, { force: true });
    }
  });

  it('reports no family trees rather than inventing one', async () => {
    const res = await api.request('/api/trees');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trees: [] });
    expect(fs.existsSync(process.env.TREEMAPPER_DB!)).toBe(false);
  });

  it('names the first tree the caller asks for', async () => {
    const res = await api.request('/api/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mormors släkt' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).tree).toMatchObject({ id: 'mormors-slakt', name: 'Mormors släkt' });
    expect(fs.existsSync(process.env.TREEMAPPER_DB!)).toBe(false);
  });
});

describe('GET /api/trees', () => {
  it('always lists the tree that was already here', async () => {
    const body = await (await api.request('/api/trees')).json();
    expect(body.trees).toHaveLength(1);
    expect(body.trees[0]).toMatchObject({ id: 'wedin', isDefault: true });
  });
});

describe('POST /api/trees/import', () => {
  it('creates a new tree and reports what it read', async () => {
    const res = await upload(MINI, 'mini.ged', 'Släkten Larsson');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tree).toMatchObject({ id: 'slakten-larsson', name: 'Släkten Larsson', persons: 3, sourceFile: 'mini.ged' });
    expect(body.summary.inserted).toMatchObject({ persons: 3, families: 1, sources: 1, media: 1 });
    expect(listTrees().map(t => t.id)).toEqual(['wedin', 'slakten-larsson']);
  });

  it('names the tree after the file when no name is given', async () => {
    const body = await (await upload(MINI, 'Farmors släkt.ged')).json();
    expect(body.tree.name).toBe('Farmors släkt');
  });

  it('leaves the existing tree alone', async () => {
    openTree('default');
    await upload(MINI);
    expect(listTrees()[0]).toMatchObject({ id: 'wedin', persons: 0 });
  });

  it('refuses a file that is not a GEDCOM, without creating anything', async () => {
    const res = await upload('det här är inte en gedcom-fil', 'anteckningar.txt');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('GEDCOM');
    expect(listTrees().map(t => t.id)).toEqual(['wedin']);
    expect(fs.existsSync(path.join(workDir, 'trees'))).toBe(false);
  });

  it('refuses an empty submission', async () => {
    const res = await upload('', 'tom.ged');
    expect(res.status).toBe(400);
  });
});

describe('renaming and deleting', () => {
  it('renames a tree', async () => {
    await upload(MINI, 'mini.ged', 'Fel namn');
    const res = await api.request('/api/trees/fel-namn', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rätt namn' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).tree.name).toBe('Rätt namn');
  });

  it('rejects an invalid GEDCOM export format', async () => {
    const res = await api.request('/api/trees/default', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gedcomFormat: '6.0' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('gedcomFormat');
  });

  it('accepts a valid GEDCOM export format', async () => {
    const res = await api.request('/api/trees/default', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gedcomFormat: '5.5.1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).tree.gedcomFormat).toBe('5.5.1');
  });

  it('deletes a tree', async () => {
    await upload(MINI, 'mini.ged', 'Larsson');
    expect((await api.request('/api/trees/larsson', { method: 'DELETE' })).status).toBe(200);
    expect(listTrees().map(t => t.id)).toEqual(['wedin']);
  });

  it('refuses to delete the tree the CLI owns', async () => {
    const res = await api.request('/api/trees/default', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(listTrees()).toHaveLength(1);
  });

  it('reports a tree that is not there', async () => {
    expect((await api.request('/api/trees/finns-inte', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('?tree= on an ordinary request', () => {
  it('reads the tree it names', async () => {
    await upload(MINI, 'mini.ged', 'Larsson');
    const persons = createPersonsApi(treeResolver());

    const fromImported = await (await persons.request('/api/persons?tree=larsson')).json();
    expect(fromImported.total).toBe(3);

    const fromDefault = await (await persons.request('/api/persons')).json();
    expect(fromDefault.total).toBe(0);
  });

  it('answers 404 for an unknown tree instead of inventing an empty one', async () => {
    const persons = createPersonsApi(treeResolver());
    const res = await persons.request('/api/persons?tree=finns-inte');
    expect(res.status).toBe(404);
    expect((await res.json()).unknownTree).toBe('finns-inte');
    expect(fs.existsSync(path.join(workDir, 'trees', 'finns-inte.db'))).toBe(false);
  });
});
