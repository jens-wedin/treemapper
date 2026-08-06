import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { families, familyChildren, persons } from '../db/schema';
import { getTree } from './tree';

let dir: string;
let db: Db;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-tree-'));
  const dbPath = path.join(dir, 't.db');
  runImport(fileURLToPath(new URL('./gedcom/fixtures/mini.ged', import.meta.url)), dbPath);
  db = createDb(dbPath);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('getTree', () => {
  it('returns null for unknown persons', () => {
    expect(getTree(db, 'I999')).toBeNull();
  });

  it('assembles ancestors and descendants around the focus', () => {
    const tree = getTree(db, 'I3')!;
    expect(tree.focus).toMatchObject({ id: 'I3' });
    expect(tree.ancestors.parents.map(p => p.person.id)).toEqual(['I1', 'I2']);
    expect(tree.ancestors.parents[0].person).toMatchObject({ givenName: 'Sven-Erik', birthYear: 1942 });
    expect(tree.descendants.children).toEqual([]);

    const i1 = getTree(db, 'I1')!;
    expect(i1.ancestors.parents).toEqual([]);
    expect(i1.descendants.children.map(c => c.person.id)).toEqual(['I3']);
  });

  it('respects depth limits', () => {
    const tree = getTree(db, 'I3', 0, 0)!;
    expect(tree.ancestors.parents).toEqual([]);
  });

  it('survives ancestry cycles', () => {
    const cyc = createDb(path.join(dir, 'cyc.db'));
    cyc.insert(persons).values([
      { id: 'A', givenName: 'A', surname: 'X', sex: 'M' },
      { id: 'B', givenName: 'B', surname: 'X', sex: 'F' },
    ]).run();
    // A is parent of B … and B is parent of A (broken data)
    cyc.insert(families).values([{ id: 'F1', husbandId: 'A' }, { id: 'F2', wifeId: 'B' }]).run();
    cyc.insert(familyChildren).values([
      { id: 1, familyId: 'F1', childId: 'B', seq: 0 },
      { id: 2, familyId: 'F2', childId: 'A', seq: 0 },
    ]).run();
    const tree = getTree(cyc, 'A', 5, 5)!; // must terminate
    expect(tree.ancestors.parents[0].person.id).toBe('B');
    expect(tree.ancestors.parents[0].parents).toEqual([]); // A not re-expanded
  });
});
