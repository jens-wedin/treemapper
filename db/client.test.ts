import { describe, it, expect } from 'vitest';
import { createDb } from './client';
import { persons, events, rawRecords, treeMeta } from './schema';

describe('db client', () => {
  it('creates schema and round-trips a person and event', () => {
    const db = createDb(':memory:');
    db.insert(persons).values({ id: 'I1', givenName: 'Sven-Erik', surname: 'Wedin', sex: 'M' }).run();
    db.insert(events).values({ id: 1, ownerType: 'person', ownerId: 'I1', type: 'BIRT', dateRaw: '15 APR 1942', dateYear: 1942, place: 'Gävleborgs län, Sverige' }).run();
    const p = db.select().from(persons).all();
    expect(p).toHaveLength(1);
    expect(p[0].surname).toBe('Wedin');
    const e = db.select().from(events).all();
    expect(e[0].dateYear).toBe(1942);
  });

  // Phase 3b lossless import: raw_records holds level-0 records we don't model
  // (SNOTE, SUBM, REPO…) and tree_meta.schema_json holds the imported file's
  // HEAD.SCHMA tag→URI map. Both are additive and unused until a later task
  // populates them; this just proves the migration lands and round-trips.
  it('round-trips a raw record and a tree_meta schema_json value', () => {
    const db = createDb(':memory:');
    db.insert(rawRecords).values({ id: 1, xref: 'N1', tag: 'SNOTE', rawTags: '[["1","NOTE","hello"]]' }).run();
    const r = db.select().from(rawRecords).all();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ xref: 'N1', tag: 'SNOTE' });

    db.insert(treeMeta).values({ id: 1, name: 'Test', createdAt: '2026-01-01', schemaJson: '{"_LOC":"https://example.com/loc"}' }).run();
    const meta = db.select().from(treeMeta).all();
    expect(meta[0].schemaJson).toBe('{"_LOC":"https://example.com/loc"}');
  });

  it('leaves schema_json null when nothing was imported', () => {
    const db = createDb(':memory:');
    db.insert(treeMeta).values({ id: 1, name: 'Test', createdAt: '2026-01-01' }).run();
    const meta = db.select().from(treeMeta).all();
    expect(meta[0].schemaJson).toBeNull();
  });
});
