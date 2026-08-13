import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { createDb } from '../db/client';
import { persons } from '../db/schema';
import { runExport } from './export';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-cli-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('writes a .gdz when gdz is requested', () => {
  const dbPath = path.join(dir, 'a.db');
  createDb(dbPath).insert(persons).values({ id: 'I1', givenName: 'A', surname: 'B' }).run();
  const out = path.join(dir, 'out.gdz');
  runExport(out, dbPath, undefined, true);       // container = gdz
  const entries = unzipSync(new Uint8Array(fs.readFileSync(out)));
  expect(Object.keys(entries)).toContain('gedcom.ged');
  expect(strFromU8(entries['gedcom.ged']!).replace(/^﻿/, '').split('\r\n')).toContain('2 VERS 7.0');
});
