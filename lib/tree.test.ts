import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { families, familyChildren, persons, media, events } from '../db/schema';
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

  it('includes the partners of people whose descendants are shown', () => {
    // I1 and I2 are married in F1, with the child I3
    const tree = getTree(db, 'I1', 0, 2)!;
    expect(tree.descendants.spouses.map(s => s.id)).toEqual(['I2']);
    expect(tree.descendants.children.map(c => c.person.id)).toEqual(['I3']);
    // I3 saknar egen familj → ingen partner
    expect(tree.descendants.children[0]!.spouses).toEqual([]);
  });

  it('does not show partners on the bottom generation', () => {
    const shallow = getTree(db, 'I1', 0, 0)!;
    expect(shallow.descendants.spouses).toEqual([]);
  });

  it('respects depth limits', () => {
    const tree = getTree(db, 'I3', 0, 0)!;
    expect(tree.ancestors.parents).toEqual([]);
  });

  it('says so when the descendants continue beyond the depth limit', () => {
    // I1 has the child I3, but we are not asking for him
    const stopped = getTree(db, 'I1', 0, 0)!;
    expect(stopped.descendants.hasMoreDescendants).toBe(true);

    // I3 saknar egna barn
    expect(getTree(db, 'I3', 0, 0)!.descendants.hasMoreDescendants).toBe(false);

    // and when the children are drawn, no continuation marker is needed
    const shown = getTree(db, 'I1', 0, 1)!;
    expect(shown.descendants.hasMoreDescendants).toBeFalsy();
  });

  it('says so when the line of descent continues beyond the depth limit', () => {
    // I3 has the parents I1 and I2, but we are not asking for them
    const stopped = getTree(db, 'I3', 0, 0)!;
    expect(stopped.ancestors.hasMoreAncestors).toBe(true);

    // I1 has no recorded parents — the line really does end there
    expect(getTree(db, 'I1', 0, 0)!.ancestors.hasMoreAncestors).toBe(false);

    // and when the parents are drawn, no continuation marker is needed
    const shown = getTree(db, 'I3', 1, 0)!;
    expect(shown.ancestors.hasMoreAncestors).toBeFalsy();
    expect(shown.ancestors.parents.every(p => p.hasMoreAncestors === false)).toBe(true);
  });

  it('chooses a portrait: the primary photo first, skipping any not downloaded', () => {
    const pdb = createDb(path.join(dir, 'photos.db'));
    pdb.insert(persons).values([
      { id: 'P1', givenName: 'Med', surname: 'Primärt', sex: 'M' },
      { id: 'P2', givenName: 'Utan', surname: 'Primärt', sex: 'F' },
      { id: 'P3', givenName: 'Inget', surname: 'Foto', sex: 'U' },
    ]).run();
    const prim = JSON.stringify([{ tag: '_PRIM', value: 'Y', children: [] }]);
    pdb.insert(media).values([
      // P1: two photos, the second marked as primary
      { id: 1, ownerType: 'person', ownerId: 'P1', originalUrl: 'u1', downloadStatus: 'done', localPath: 'media/1.jpg' },
      { id: 2, ownerType: 'person', ownerId: 'P1', originalUrl: 'u2', downloadStatus: 'done', localPath: 'media/2.jpg', rawTags: prim },
      // P2: bara ett nedladdat foto, plus ett som misslyckades
      { id: 3, ownerType: 'person', ownerId: 'P2', originalUrl: 'u3', downloadStatus: 'failed' },
      { id: 4, ownerType: 'person', ownerId: 'P2', originalUrl: 'u4', downloadStatus: 'done', localPath: 'media/4.jpg' },
      // P3: bara ett foto som inte laddats ner
      { id: 5, ownerType: 'person', ownerId: 'P3', originalUrl: 'u5', downloadStatus: 'failed' },
    ]).run();

    expect(getTree(pdb, 'P1')!.focus.photoId).toBe(2);   // primary beats the lower id
    expect(getTree(pdb, 'P2')!.focus.photoId).toBe(4);   // skips the failed one
    expect(getTree(pdb, 'P3')!.focus.photoId).toBeNull();
  });

  it('sets a country only when the birthplace names one', () => {
    const cdb = createDb(path.join(dir, 'countries.db'));
    cdb.insert(persons).values([
      { id: 'C1', givenName: 'Med', surname: 'Land', sex: 'M' },
      { id: 'C2', givenName: 'Bara', surname: 'Socken', sex: 'F' },
      { id: 'C3', givenName: 'Dop', surname: 'Land', sex: 'U' },
      { id: 'C4', givenName: 'Bara', surname: 'Bosatt', sex: 'U' },
    ]).run();
    cdb.insert(events).values([
      { id: 1, ownerType: 'person', ownerId: 'C1', type: 'BIRT', place: 'Alnön, Västernorrland, Sverige' },
      { id: 2, ownerType: 'person', ownerId: 'C2', type: 'BIRT', place: 'Bjuråker' },
      { id: 3, ownerType: 'person', ownerId: 'C3', type: 'CHR', place: 'Vasa, Finland' },
      // a residence in the USA must NOT set a flag — it says nothing about where they were born
      { id: 4, ownerType: 'person', ownerId: 'C4', type: 'RESI', place: 'Chicago, Illinois, USA' },
    ]).run();

    expect(getTree(cdb, 'C1')!.focus.country).toBe('SE');
    expect(getTree(cdb, 'C2')!.focus.country).toBeNull();
    expect(getTree(cdb, 'C3')!.focus.country).toBe('FI');
    expect(getTree(cdb, 'C4')!.focus.country).toBeNull();
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
