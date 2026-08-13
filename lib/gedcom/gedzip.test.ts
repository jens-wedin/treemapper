import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { createDb, type Db } from '../../db/client';
import { persons, media } from '../../db/schema';
import { parseGedcom } from './parser';
import { buildGedzip } from './gedzip';

let db: Db;
let dir: string;

beforeEach(() => {
  db = createDb(':memory:');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedzip-'));
  db.insert(persons).values({ id: 'I1', givenName: 'Anders', surname: 'Testsson', sex: 'M' }).run();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('bundles a downloaded photo and rewrites its FILE payload; leaves an undownloaded one as a URL', () => {
  const jpg = path.join(dir, '1.jpg');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); // a few fake JPEG bytes
  db.insert(media).values([
    { id: 1, ownerType: 'person', ownerId: 'I1', title: 'Foto', originalUrl: 'https://cdn/x/1.jpg',
      form: 'jpg', downloadStatus: 'done', localPath: jpg },
    { id: 2, ownerType: 'person', ownerId: 'I1', title: 'Ej hämtad', originalUrl: 'https://cdn/x/2.jpg',
      form: 'jpg', downloadStatus: 'pending', localPath: null },
  ]).run();

  const zip = buildGedzip(db);
  const entries = unzipSync(zip);

  // gedcom.ged is present, is 7.0, and points the bundled photo at 1.jpg
  expect(Object.keys(entries)).toContain('gedcom.ged');
  const ged = strFromU8(entries['gedcom.ged']!).replace(/^﻿/, '');
  const lines = ged.split('\r\n');
  expect(lines).toContain('2 VERS 7.0');
  expect(lines).toContain('1 FILE 1.jpg');                    // downloaded → bundle path
  expect(lines).toContain('1 FILE https://cdn/x/2.jpg');      // undownloaded → URL
  expect(parseGedcom(ged).length).toBeGreaterThan(0);         // re-parseable

  // the photo's bytes are in the archive under the same name; the URL-only one is not
  expect(Object.keys(entries)).toContain('1.jpg');
  expect([...entries['1.jpg']!]).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  expect(Object.keys(entries)).not.toContain('2.jpg');
});

it('treats a done row whose file is missing on disk as not bundled', () => {
  db.insert(media).values({ id: 3, ownerType: 'person', ownerId: 'I1', title: null,
    originalUrl: 'https://cdn/x/3.jpg', form: 'jpg', downloadStatus: 'done',
    localPath: path.join(dir, 'does-not-exist.jpg') }).run();
  const entries = unzipSync(buildGedzip(db));
  const ged = strFromU8(entries['gedcom.ged']!).replace(/^﻿/, '');
  expect(ged.split('\r\n')).toContain('1 FILE https://cdn/x/3.jpg'); // fell back to URL
  expect(Object.keys(entries)).not.toContain('3.jpg');
});
