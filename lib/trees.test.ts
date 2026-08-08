import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TreeNotFound, closeTrees, createTree, deleteTree, listTrees, openTree, renameTree } from './trees';

const MINI = path.resolve('lib/gedcom/fixtures/mini.ged');

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-trees-'));
  process.env.WEDIN_DB = path.join(workDir, 'wedin.db');
  process.env.WEDIN_TREES_DIR = path.join(workDir, 'trees');
  process.env.WEDIN_MEDIA_DIR = path.join(workDir, 'media');
  closeTrees();
});

afterEach(() => {
  closeTrees();
  fs.rmSync(workDir, { recursive: true, force: true });
  delete process.env.WEDIN_DB;
  delete process.env.WEDIN_TREES_DIR;
  delete process.env.WEDIN_MEDIA_DIR;
});

describe('the default tree', () => {
  it('is always present and named after its file', () => {
    const trees = listTrees();
    expect(trees).toHaveLength(1);
    expect(trees[0]).toMatchObject({ id: 'default', name: 'wedin', isDefault: true, persons: 0 });
  });

  it('cannot be deleted — the CLI scripts own that file', () => {
    openTree('default');
    expect(() => deleteTree('default')).toThrow();
    expect(fs.existsSync(process.env.WEDIN_DB!)).toBe(true);
  });

  it('can be renamed, and the name survives a reopen', () => {
    renameTree('default', 'Wedin släktträd');
    closeTrees();
    expect(listTrees()[0]!.name).toBe('Wedin släktträd');
  });
});

describe('importing a tree', () => {
  it('creates a separate database and leaves the default tree alone', () => {
    const { tree, summary } = createTree('Släkten Larsson', MINI, 'larsson.ged');

    expect(tree.id).toBe('slakten-larsson');
    expect(tree.persons).toBe(3);
    expect(tree.sourceFile).toBe('larsson.ged');
    expect(summary.inserted).toMatchObject({ persons: 3, families: 1, sources: 1, media: 1 });
    expect(fs.existsSync(path.join(workDir, 'trees', 'slakten-larsson.db'))).toBe(true);

    const trees = listTrees();
    expect(trees.map(t => t.id)).toEqual(['default', 'slakten-larsson']);
    expect(trees[0]!.persons).toBe(0);   // the tree that already existed is untouched
  });

  it('counts photos that have no file yet', () => {
    const { tree } = createTree('Foton', MINI, 'x.ged');
    expect(tree.photosPending).toBe(1);
  });

  it('folds Swedish letters into the id', () => {
    expect(createTree('Åsa Öberg Ängsö', MINI, 'x.ged').tree.id).toBe('asa-oberg-angso');
  });

  it('gives the second tree of the same name its own id', () => {
    expect(createTree('Larsson', MINI, 'x.ged').tree.id).toBe('larsson');
    expect(createTree('Larsson', MINI, 'x.ged').tree.id).toBe('larsson-2');
    expect(createTree('Larsson', MINI, 'x.ged').tree.id).toBe('larsson-3');
    expect(listTrees()).toHaveLength(4);
  });

  it('never allocates the reserved id', () => {
    expect(createTree('default', MINI, 'x.ged').tree.id).toBe('default-2');
  });

  it('falls back to a usable id when the name has no letters', () => {
    expect(createTree('***', MINI, 'x.ged').tree.id).toBe('trad');
  });

  it('leaves nothing behind when the import fails', () => {
    expect(() => createTree('Trasig', path.join(workDir, 'finns-inte.ged'), 'x.ged')).toThrow();
    expect(listTrees().map(t => t.id)).toEqual(['default']);
    expect(fs.existsSync(path.join(workDir, 'trees', 'trasig.db'))).toBe(false);
  });
});

describe('opening and deleting', () => {
  it('reads only the tree that was asked for', () => {
    createTree('Larsson', MINI, 'x.ged');
    expect(openTree('larsson').$client.name).toContain('larsson.db');
    expect(openTree('default').$client.name).toContain('wedin.db');
  });

  it('refuses an unknown id without creating a database for it', () => {
    expect(() => openTree('finns-inte')).toThrow(TreeNotFound);
    expect(fs.existsSync(path.join(workDir, 'trees', 'finns-inte.db'))).toBe(false);
  });

  it('removes the database and its photos', () => {
    const { tree } = createTree('Larsson', MINI, 'x.ged');
    const photoDir = path.join(workDir, 'media', tree.id);
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, '1.jpg'), 'x');

    deleteTree(tree.id);

    expect(listTrees().map(t => t.id)).toEqual(['default']);
    expect(fs.existsSync(path.join(workDir, 'trees', 'larsson.db'))).toBe(false);
    expect(fs.existsSync(photoDir)).toBe(false);
    expect(() => openTree(tree.id)).toThrow(TreeNotFound);
  });
});
