import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { listSources, getSourceFull } from './sources';

const fixture = fileURLToPath(new URL('./gedcom/fixtures/mini.ged', import.meta.url));
let dir: string;
let db: Db;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-sources-'));
  const dbPath = path.join(dir, 's.db');
  runImport(fixture, dbPath);
  db = createDb(dbPath);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('listSources', () => {
  it('listar källor med antal hänvisningar', () => {
    const { items, total } = listSources(db);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      id: 'S1', title: 'Kyrkbok Hälsingland', author: 'Svenska kyrkan',
    });
    expect(items[0].citationCount).toBe(2); // en på händelse, en på person
  });

  it('söker på titel och författare', () => {
    expect(listSources(db, { q: 'Hälsingland' }).total).toBe(1);
    expect(listSources(db, { q: 'Svenska kyrkan' }).total).toBe(1);
    expect(listSources(db, { q: 'finns inte' }).total).toBe(0);
  });
});

describe('getSourceFull', () => {
  it('returnerar null för okänd källa', () => {
    expect(getSourceFull(db, 'S999')).toBeNull();
  });

  it('löser upp hänvisningar till personer och händelser', () => {
    const full = getSourceFull(db, 'S1')!;
    expect(full.source).toMatchObject({ id: 'S1', title: 'Kyrkbok Hälsingland' });
    expect(full.citations).toHaveLength(2);

    const eventCitation = full.citations.find(c => c.ownerType === 'event')!;
    expect(eventCitation.personId).toBe('I1');
    expect(eventCitation.personName).toBe('Sven-Erik Wedin');
    expect(eventCitation.eventType).toBe('BIRT');
    expect(eventCitation.page).toBe('Sida 12');

    const personCitation = full.citations.find(c => c.ownerType === 'person')!;
    expect(personCitation.personId).toBe('I3');
    expect(personCitation.page).toBe('Sida 99');
  });
});
