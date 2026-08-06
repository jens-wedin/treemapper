import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { persons, events, citations, auditLog, familyChildren } from '../db/schema';
import { updatePerson, createEvent, updateEvent, deleteEvent } from './mutations';

const fixture = fileURLToPath(new URL('./gedcom/fixtures/mini.ged', import.meta.url));
let dir: string;
let db: Db;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-mut-'));
  const dbPath = path.join(dir, 'm.db');
  runImport(fixture, dbPath);
  db = createDb(dbPath);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('updatePerson', () => {
  it('updates fields, bumps updatedAt, audits before/after', () => {
    const r = updatePerson(db, 'I1', { givenName: 'Sven-Erik Test' });
    expect(r.warnings).toEqual([]);
    const p = db.select().from(persons).where(eq(persons.id, 'I1')).all()[0];
    expect(p.givenName).toBe('Sven-Erik Test');
    expect(p.updatedAt >= p.createdAt).toBe(true);
    const log = db.select().from(auditLog).all().at(-1)!;
    expect(log).toMatchObject({ action: 'update', entityType: 'person', entityId: 'I1' });
    expect(JSON.parse(log.before!).givenName).toBe('Sven-Erik');
    expect(JSON.parse(log.after!).givenName).toBe('Sven-Erik Test');
  });

  it('404s in Swedish for unknown persons', () => {
    expect(() => updatePerson(db, 'I999', {})).toThrowError('Personen finns inte');
  });
});

describe('events', () => {
  it('creates with parsed year and audits', () => {
    const r = createEvent(db, { type: 'OCCU', ownerType: 'person', ownerId: 'I1', dateRaw: 'ABT 1970', place: null, description: 'Testyrke', age: null });
    expect(r.warnings).toEqual([]);
    const e = db.select().from(events).where(eq(events.id, r.data.id)).all()[0];
    expect(e).toMatchObject({ type: 'OCCU', dateYear: 1970, description: 'Testyrke' });
    const log = db.select().from(auditLog).all().at(-1)!;
    expect(log).toMatchObject({ action: 'create', entityType: 'event', entityId: String(r.data.id) });
    expect(log.before).toBeNull();
  });

  it('accepts fuzzy dates containing a year without warning', () => {
    const r = createEvent(db, { type: 'EVEN', ownerType: 'person', ownerId: 'I1', dateRaw: 'nån gång på 1700-talet?', place: null, description: null, age: null });
    expect(r.warnings).toEqual([]);
    expect(db.select().from(events).where(eq(events.id, r.data.id)).all()[0].dateYear).toBe(1700);
  });

  it('accepts yearless dates with a warning — never rejects', () => {
    const r = createEvent(db, { type: 'EVEN', ownerType: 'person', ownerId: 'I1', dateRaw: 'okänt datum', place: null, description: null, age: null });
    expect(r.warnings[0]).toContain('kunde inte tolkas');
    const e = db.select().from(events).where(eq(events.id, r.data.id)).all()[0];
    expect(e.dateRaw).toBe('okänt datum');
    expect(e.dateYear).toBeNull();
  });

  it('rejects events on missing owners', () => {
    expect(() => createEvent(db, { type: 'OCCU', ownerType: 'person', ownerId: 'I999', dateRaw: null, place: null, description: null, age: null })).toThrowError('Ägaren finns inte');
  });

  it('updates recomputing the year', () => {
    const id = db.select().from(events).all().find(e => e.type === 'OCCU' && e.description === 'Testyrke')!.id;
    const r = updateEvent(db, id, { dateRaw: '1971' });
    expect(r.warnings).toEqual([]);
    expect(db.select().from(events).where(eq(events.id, id)).all()[0].dateYear).toBe(1971);
  });

  it('deletes an event together with its citations, auditing both', () => {
    const birt = db.select().from(events).all().find(e => e.type === 'BIRT' && e.ownerId === 'I1')!;
    const citCount = db.select().from(citations).all()
      .filter(c => c.ownerType === 'event' && c.ownerId === String(birt.id)).length;
    expect(citCount).toBeGreaterThan(0);
    deleteEvent(db, birt.id);
    expect(db.select().from(events).where(eq(events.id, birt.id)).all()).toHaveLength(0);
    expect(db.select().from(citations).all().filter(c => c.ownerType === 'event' && c.ownerId === String(birt.id))).toHaveLength(0);
    const types = db.select().from(auditLog).all().slice(-2).map(l => l.entityType).sort();
    expect(types).toEqual(['citation', 'event']);
  });
});
