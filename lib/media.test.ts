import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client';
import { auditLog, media, persons } from '../db/schema';
import { addPhoto, removePhoto } from './media';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-media-'));
  db = createDb(path.join(dir, 'test.db'));
  db.insert(persons).values({ id: 'I1', givenName: 'Test', surname: 'Person' }).run();
});

afterEach(() => {
  db.$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const photoDir = () => path.join(dir, 'media');

describe('adding a photo', () => {
  it('writes the file under the row id and points the record at it', () => {
    const { id } = addPhoto(db, { ownerId: 'I1', title: 'Farmor', mimeType: 'image/png', bytes: PIXEL }, photoDir());

    expect(fs.existsSync(path.join(photoDir(), `${id}.png`))).toBe(true);
    const row = db.select().from(media).all()[0]!;
    expect(row).toMatchObject({
      ownerType: 'person', ownerId: 'I1', title: 'Farmor',
      form: 'png', downloadStatus: 'done', filesize: PIXEL.length,
      // The folder the file really went to. It used to say `media/` whatever
      // the tree, which is a path that does not exist for any tree but the
      // first — and that string is what the export writes as FILE.
      localPath: path.join(photoDir(), `${id}.png`),
    });
    // The export writes FILE from originalUrl — an uploaded photo has to name
    // its own file there, or it would export as a photo with no source.
    expect(row.originalUrl).toBe(path.join(photoDir(), `${id}.png`));
  });

  it('is written to the change log', () => {
    addPhoto(db, { ownerId: 'I1', title: null, mimeType: 'image/png', bytes: PIXEL }, photoDir());
    const entry = db.select().from(auditLog).all().find(a => a.entityType === 'media')!;
    expect(entry.action).toBe('create');
  });

  it('refuses what is not an image, an empty file, and an unknown person', () => {
    expect(() => addPhoto(db, { ownerId: 'I1', title: null, mimeType: 'application/pdf', bytes: PIXEL }, photoDir()))
      .toThrow(/not supported/);
    expect(() => addPhoto(db, { ownerId: 'I1', title: null, mimeType: 'image/png', bytes: Buffer.alloc(0) }, photoDir()))
      .toThrow(/empty/);
    expect(() => addPhoto(db, { ownerId: 'I999', title: null, mimeType: 'image/png', bytes: PIXEL }, photoDir()))
      .toThrow(/does not exist/);
    expect(db.select().from(media).all()).toHaveLength(0);
  });
});

describe('removing a photo', () => {
  it('drops the record but leaves the file alone', () => {
    const { id } = addPhoto(db, { ownerId: 'I1', title: null, mimeType: 'image/png', bytes: PIXEL }, photoDir());
    removePhoto(db, id);

    expect(db.select().from(media).all()).toHaveLength(0);
    // The row can be read back out of the audit log; the picture may be the
    // only copy of a face nobody living remembers.
    expect(fs.existsSync(path.join(photoDir(), `${id}.png`))).toBe(true);
    const entry = db.select().from(auditLog).all().find(a => a.action === 'delete')!;
    expect(JSON.parse(entry.before!).id).toBe(id);
  });

  it('says so when the photo is not there', () => {
    expect(() => removePhoto(db, 999)).toThrow(/does not exist/);
  });
});
