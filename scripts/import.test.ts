import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from './import';
import { createDb } from '../db/client';
import { persons, media } from '../db/schema';

const fixture = fileURLToPath(new URL('../lib/gedcom/fixtures/mini.ged', import.meta.url));
let tmpDb: string;

afterEach(() => { if (tmpDb && fs.existsSync(tmpDb)) fs.rmSync(tmpDb); });

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
