import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { createDb, type Db } from '../../db/client';
import { persons, media } from '../../db/schema';
import { parseGedcom } from './parser';
import { mapGedcom } from './mapper';
import { buildGedzip, readGedzip, isZip } from './gedzip';

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

it('the gedcom.ged is 7.0-shaped and every bundled FILE has a matching entry', () => {
  const jpg = path.join(dir, '7.jpg');
  fs.writeFileSync(jpg, Buffer.from([1, 2, 3]));
  db.insert(media).values({ id: 7, ownerType: 'person', ownerId: 'I1', title: 'P', originalUrl: 'https://cdn/x/7.jpg',
    form: 'jpg', downloadStatus: 'done', localPath: jpg }).run();

  const entries = unzipSync(buildGedzip(db));
  const lines = strFromU8(entries['gedcom.ged']!).replace(/^﻿/, '').split('\r\n');
  expect(lines.some(l => / CONC /.test(l))).toBe(false);   // 7.0: no CONC
  expect(lines).not.toContain('1 CHAR UTF-8');             // 7.0: no CHAR
  // every local (non-URL) FILE payload names an entry that exists in the archive
  const localFiles = lines.filter(l => /^1 FILE /.test(l)).map(l => l.slice(7)).filter(v => !/^https?:/.test(v));
  expect(localFiles).toContain('7.jpg');
  for (const f of localFiles) expect(Object.keys(entries)).toContain(f);
});

it('reads a .gdz back into gedcom.ged text and its media bytes', () => {
  const ged = '﻿0 HEAD\r\n1 GEDC\r\n2 VERS 7.0\r\n0 TRLR';
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const zip = zipSync({ 'gedcom.ged': strToU8(ged), '7.jpg': jpg });
  expect(isZip(zip)).toBe(true);
  expect(isZip(strToU8('0 HEAD'))).toBe(false);
  const out = readGedzip(zip);
  expect(out.gedcomText.replace(/^﻿/, '').split('\r\n')).toContain('2 VERS 7.0');
  expect([...out.media.get('7.jpg')!]).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
  expect(out.media.has('gedcom.ged')).toBe(false);   // gedcom.ged is not media
});

it('rejects a zip with no gedcom.ged', () => {
  const zip = zipSync({ 'notes.txt': strToU8('hi') });
  expect(() => readGedzip(zip)).toThrow(/gedcom\.ged/);
});

it('a built .gdz round-trips: buildGedzip → readGedzip → mapGedcom yields a media row', () => {
  const jpg = path.join(dir, '1.jpg');
  fs.writeFileSync(jpg, Buffer.from([9, 8, 7, 6]));
  db.insert(media).values({ id: 1, ownerType: 'person', ownerId: 'I1', title: 'Foto',
    originalUrl: 'https://cdn/x/1.jpg', form: 'jpg', downloadStatus: 'done', localPath: jpg }).run();

  const out = readGedzip(buildGedzip(db));
  // the archive bundled the photo under buildGedzip's id-based name
  expect(out.media.has('1.jpg')).toBe(true);
  expect([...out.media.get('1.jpg')!]).toEqual([9, 8, 7, 6]);

  // re-importing with the archive's names as localFiles turns the OBJE back into a media row
  const remapped = mapGedcom(parseGedcom(out.gedcomText), { localFiles: new Set(out.media.keys()) });
  expect(remapped.media).toHaveLength(1);
  expect(remapped.media[0]!.ownerId).toBe('I1');
  expect(remapped.media[0]!.originalUrl).toBe('1.jpg');         // the bundle entry name it maps back to
  expect(out.media.has(remapped.media[0]!.originalUrl)).toBe(true);
});
