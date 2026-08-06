import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { media } from '../db/schema';
import { refreshMediaUrls } from './refreshMedia';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-refresh-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const FRESH_GED = [
  '0 HEAD',
  '0 @I1@ INDI',
  '1 NAME Anders /Testsson/',
  '1 OBJE',
  '2 FORM jpg',
  '2 FILE https://cdn.example.com/NEW/a.jpg',
  '2 _FILESIZE 100',
  '2 _PHOTO_RIN MH:P1',
  '1 OBJE',
  '2 FORM jpg',
  '2 FILE https://cdn.example.com/NEW/b.jpg',
  '2 TITL Bröllopsfoto',
  '0 TRLR',
].join('\n');

describe('refreshMediaUrls', () => {
  it('re-arms failed rows by _PHOTO_RIN, falls back to owner+title, reports unmatched', () => {
    const dbPath = path.join(dir, 'r.db');
    const db = createDb(dbPath);
    const rin = (v: string) => JSON.stringify([{ tag: '_PHOTO_RIN', value: v }]);
    db.insert(media).values([
      { id: 1, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://old/1.jpg', downloadStatus: 'failed', rawTags: rin('MH:P1'), filesize: 100 },
      { id: 2, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://old/2.jpg', downloadStatus: 'failed', title: 'Bröllopsfoto' },
      { id: 3, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://old/3.jpg', downloadStatus: 'failed', rawTags: rin('MH:P999') },
      { id: 4, ownerType: 'person', ownerId: 'I1', originalUrl: 'https://old/4.jpg', downloadStatus: 'done', localPath: 'media/4.jpg' },
    ]).run();

    const gedPath = path.join(dir, 'fresh.ged');
    fs.writeFileSync(gedPath, FRESH_GED, 'utf-8');

    const result = refreshMediaUrls(gedPath, dbPath);
    expect(result.matched).toBe(2);
    expect(result.total).toBe(3);
    expect(result.unmatched.map(u => u.id)).toEqual([3]);

    const m1 = db.select().from(media).where(eq(media.id, 1)).all()[0];
    expect(m1.originalUrl).toBe('https://cdn.example.com/NEW/a.jpg');
    expect(m1.downloadStatus).toBe('pending');
    const m2 = db.select().from(media).where(eq(media.id, 2)).all()[0];
    expect(m2.originalUrl).toBe('https://cdn.example.com/NEW/b.jpg');
    expect(m2.downloadStatus).toBe('pending');
    const m4 = db.select().from(media).where(eq(media.id, 4)).all()[0];
    expect(m4.originalUrl).toBe('https://old/4.jpg');
    expect(m4.downloadStatus).toBe('done');
  });
});
