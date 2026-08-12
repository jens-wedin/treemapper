import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { persons } from '../db/schema';
import { createDb } from '../db/client';
import { TreeNotFound, closeTrees, createEmptyTree, createTree, defaultTreeId, deleteTree, listTrees, openTree, renameTree } from './trees';
import { SAFE_ENV } from '../vitest.setup';

const MINI = path.resolve('lib/gedcom/fixtures/mini.ged');

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-trees-'));
  process.env.WEDIN_DB = path.join(workDir, 'wedin.db');
  process.env.WEDIN_TREES_DIR = path.join(workDir, 'trees');
  process.env.WEDIN_MEDIA_DIR = path.join(workDir, 'media');
  closeTrees();
  giveThemADefaultTree();
});

/**
 * The state Jens's own machine is in: `wedin.db` exists, because an import once
 * made it. Most of this file is about that installation. A fresh clone has no
 * such file, and gets its own describe block below.
 */
function giveThemADefaultTree() {
  createDb(process.env.WEDIN_DB!).$client.close();
}

afterEach(() => {
  closeTrees();
  fs.rmSync(workDir, { recursive: true, force: true });
  // Restored, not deleted: unsetting them would let lib/trees.ts fall back
  // to the real wedin.db for any test file sharing this worker.
  Object.assign(process.env, SAFE_ENV);
});

describe('a fresh clone, with no family tree at all', () => {
  beforeEach(() => {
    closeTrees();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${process.env.WEDIN_DB}${suffix}`, { force: true });
    }
  });

  it('has no family trees', () => {
    expect(listTrees()).toEqual([]);
  });

  it('writes no database merely because something asked whether one exists', () => {
    // The bug this replaces: `wedin.db` appeared as a side effect of listing,
    // so a stranger who cloned the repo was handed an empty tree named after
    // somebody else's family. Asserted on the file, because the damage was
    // never visible in the return value.
    listTrees();
    defaultTreeId();
    expect(fs.existsSync(process.env.WEDIN_DB!)).toBe(false);
  });

  it('refuses to open a tree that is not there, default or not', () => {
    expect(() => openTree('default')).toThrow(TreeNotFound);
    expect(fs.existsSync(process.env.WEDIN_DB!)).toBe(false);
  });

  it('names the first tree after itself', () => {
    const tree = createEmptyTree('Mormors släkt');
    expect(tree).toMatchObject({ id: 'mormors-slakt', name: 'Mormors släkt', isDefault: false });
    expect(fs.existsSync(path.join(process.env.WEDIN_TREES_DIR!, 'mormors-slakt.db'))).toBe(true);
    expect(fs.existsSync(process.env.WEDIN_DB!)).toBe(false);
    expect(listTrees().map(t => t.id)).toEqual(['mormors-slakt']);
  });

  it('lets the first tree be deleted again, having nothing to protect', () => {
    const tree = createEmptyTree('Mormors släkt');
    expect(() => deleteTree(tree.id)).not.toThrow();
    expect(listTrees()).toEqual([]);
  });
});

describe('the default tree', () => {
  it('is listed once its file exists, named after that file', () => {
    const trees = listTrees();
    expect(trees).toHaveLength(1);
    expect(trees[0]).toMatchObject({ id: 'wedin', name: 'wedin', isDefault: true, persons: 0 });
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

describe('a tree is addressed by a stable slug', () => {
  /**
   * The slug is what appears in the URL — `/wedin/personer`. It comes from the
   * database's filename, never from the display name, because a URL somebody
   * saved has to outlive them renaming the tree.
   */
  it('gives the default tree a real id rather than the word "default"', () => {
    expect(listTrees()[0]).toMatchObject({ id: 'wedin', isDefault: true });
  });

  it('still answers to "default", so saved links and stored state keep working', () => {
    expect(openTree('default')).toBe(openTree('wedin'));
  });

  it('keeps the id when the tree is renamed', () => {
    renameTree('wedin', 'Släkten Wedin');
    closeTrees();
    expect(listTrees()[0]).toMatchObject({ id: 'wedin', name: 'Släkten Wedin' });
  });

  /**
   * The alias is the trap: the "cannot be deleted" guard used to compare the
   * literal string `default`, which a second name for the same file walks
   * straight past. It compares the resolved file now.
   */
  it('will not let either name delete the family database', () => {
    openTree('wedin');
    const file = process.env.WEDIN_DB!;

    expect(() => deleteTree('wedin')).toThrow();
    expect(() => deleteTree('default')).toThrow();

    expect(fs.existsSync(file)).toBe(true);
  });

  it('will not hand a new tree the default tree\'s id', () => {
    expect(createTree('Wedin', MINI, 'x.ged').tree.id).toBe('wedin-2');
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
    expect(trees.map(t => t.id)).toEqual(['wedin', 'slakten-larsson']);
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
    expect(createTree('***', MINI, 'x.ged').tree.id).toBe('slakt');
  });

  it('will not take an id the router needs for a page', () => {
    // `/personer` has to mean the People page, so a tree cannot be `personer`.
    expect(createTree('Personer', MINI, 'x.ged').tree.id).toBe('personer-2');
    expect(createTree('Träd', MINI, 'x.ged').tree.id).toBe('trad-2');
  });

  it('leaves nothing behind when the import fails', () => {
    expect(() => createTree('Trasig', path.join(workDir, 'finns-inte.ged'), 'x.ged')).toThrow();
    expect(listTrees().map(t => t.id)).toEqual(['wedin']);
    expect(fs.existsSync(path.join(workDir, 'trees', 'trasig.db'))).toBe(false);
  });
});

describe('a tree started from nothing', () => {
  it('is created empty, named, and ready to be added to', () => {
    const tree = createEmptyTree('Mormors släkt');

    expect(tree).toMatchObject({ id: 'mormors-slakt', name: 'Mormors släkt', persons: 0, sourceFile: null });
    expect(listTrees().map(t => t.id)).toEqual(['wedin', 'mormors-slakt']);
    // The migrations have run, so the tables are there — it simply has no rows.
    expect(openTree('mormors-slakt').select().from(persons).all()).toEqual([]);
  });

  it('shares the naming rules with an imported one', () => {
    createTree('Larsson', MINI, 'x.ged');
    expect(createEmptyTree('Larsson').id).toBe('larsson-2');
  });
});

describe('a tree id is not a path', () => {
  /**
   * The whole reason ids are validated: `DELETE /api/trees/..%2Fwedin` used to
   * answer 200 and take the family database with it, past the guard that only
   * ever compared against the literal `default`.
   */
  const escapes = ['../wedin', '../../etc/passwd', 'a/../../b', './x', 'x/y', '..', '', 'Trad', 'träd', 'x\u0000y'];

  it('refuses anything that could climb out of the trees directory', () => {
    for (const id of escapes) {
      expect(() => openTree(id), id).toThrow(TreeNotFound);
      expect(() => deleteTree(id), id).toThrow(TreeNotFound);
    }
  });

  it('leaves the family database alone when asked to delete ../wedin', () => {
    openTree('default');
    const wedin = process.env.WEDIN_DB!;
    expect(fs.existsSync(wedin)).toBe(true);

    expect(() => deleteTree('../wedin')).toThrow(TreeNotFound);

    expect(fs.existsSync(wedin)).toBe(true);
  });

  it('still accepts the ids it makes itself', () => {
    const { tree } = createTree('Åsa Öberg', MINI, 'x.ged');
    expect(() => openTree(tree.id)).not.toThrow();
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

    expect(listTrees().map(t => t.id)).toEqual(['wedin']);
    expect(fs.existsSync(path.join(workDir, 'trees', 'larsson.db'))).toBe(false);
    expect(fs.existsSync(photoDir)).toBe(false);
    expect(() => openTree(tree.id)).toThrow(TreeNotFound);
  });
});
