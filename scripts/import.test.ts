import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport, readArgs } from './import';
import { createDb } from '../db/client';
import { persons, media } from '../db/schema';

const fixture = fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url));
let tmpDb: string;

afterEach(() => { if (tmpDb && fs.existsSync(tmpDb)) fs.rmSync(tmpDb); });

describe('what the command line asks for', () => {
  it('takes a file and a name for the tree', () => {
    expect(readArgs(['family.ged', 'Mormors släkt']))
      .toEqual({ gedPath: 'family.ged', name: 'Mormors släkt' });
  });

  it('will not guess the name, because the name decides the filename', () => {
    expect(readArgs(['family.ged'])).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('will not guess the file either', () => {
    // It used to default to `data/Wedin_Family_Tree_CLEANED.ged`, so running
    // the command with no arguments tried to import somebody else's family.
    expect(readArgs([])).toMatchObject({ error: expect.stringContaining('GEDCOM') });
  });

  it('refuses a name that is only whitespace', () => {
    expect(readArgs(['family.ged', '   '])).toMatchObject({ error: expect.stringContaining('name') });
  });
});

describe('runImport', () => {
  it('imports the fixture and verifies counts', () => {
    tmpDb = path.join(os.tmpdir(), `wedin-test-${process.pid}.db`);
    const summary = runImport(fixture, tmpDb);
    expect(summary.sourceRecords).toEqual({ INDI: 3, FAM: 1, SOUR: 1, ALBUM: 1 });
    expect(summary.inserted.persons).toBe(3);
    expect(summary.inserted.media).toBe(1);
    const db = createDb(tmpDb);
    expect(db.select().from(persons).all()).toHaveLength(3);
    expect(db.select().from(media).all()[0].downloadStatus).toBe('pending');
  });
});
