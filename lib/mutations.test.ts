import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { runImport } from '../scripts/import';
import { createDb, type Db } from '../db/client';
import { persons, events, citations, auditLog, familyChildren, families } from '../db/schema';
import { updatePerson, createEvent, updateEvent, deleteEvent, addRelation, removeChildLink, MutationError } from './mutations';

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

describe('addRelation', () => {
  it('adds a new-person child to the only family with next seq', () => {
    const r = addRelation(db, { type: 'child', personId: 'I1', newPerson: { givenName: 'Nya', surname: 'Barnet', sex: 'F' } });
    expect(r.data).toEqual({ relativeId: 'I4', familyId: 'F1' });
    const links = db.select().from(familyChildren).all().filter(l => l.familyId === 'F1').sort((a, b) => a.seq - b.seq);
    expect(links.map(l => l.childId)).toEqual(['I3', 'I4']);
    const p4 = db.select().from(persons).where(eq(persons.id, 'I4')).all()[0];
    expect(p4).toMatchObject({ givenName: 'Nya', sex: 'F' });
  });

  it('rejects duplicates, self-relations, cycles and re-marriage in Swedish', () => {
    expect(() => addRelation(db, { type: 'child', personId: 'I1', relativeId: 'I3' })).toThrowError('redan barn');
    expect(() => addRelation(db, { type: 'child', personId: 'I1', relativeId: 'I1' })).toThrowError('sin egen släkting');
    expect(() => addRelation(db, { type: 'child', personId: 'I3', relativeId: 'I1' })).toThrowError('omöjlig släktlinje');
    expect(() => addRelation(db, { type: 'spouse', personId: 'I1', relativeId: 'I2' })).toThrowError('redan partner');
  });

  it('creates a new family for a spouse', () => {
    const r = addRelation(db, { type: 'spouse', personId: 'I3', newPerson: { givenName: 'Partner', surname: 'Ny', sex: 'F' } });
    expect(r.data.relativeId).toBe('I5');
    expect(r.data.familyId).toBe('F2');
    const f = db.select().from(families).where(eq(families.id, 'F2')).all()[0];
    expect(f.wifeId).toBe('I5');
    expect([f.husbandId, f.wifeId]).toContain('I3');
  });

  it('adds a child into a selected family', () => {
    const r = addRelation(db, { type: 'child', personId: 'I3', familyId: 'F2', newPerson: { givenName: 'Barn', surname: 'Tre', sex: 'U' } });
    expect(r.data).toEqual({ relativeId: 'I6', familyId: 'F2' });
  });

  it('fills a free parent slot, then rejects a third parent', () => {
    // I6 gets a child I7 → new family F3 holds only I6 → one parent slot free
    const child = addRelation(db, { type: 'child', personId: 'I6', newPerson: { givenName: 'Barnbarn', surname: 'Tre', sex: 'M' } });
    expect(child.data).toEqual({ relativeId: 'I7', familyId: 'F3' });
    const fill = addRelation(db, { type: 'parent', personId: 'I7', relativeId: 'I2' });
    expect(fill.data.familyId).toBe('F3');
    expect(db.select().from(families).where(eq(families.id, 'F3')).all()[0].wifeId).toBe('I2');
    expect(() => addRelation(db, { type: 'parent', personId: 'I7', newPerson: { givenName: 'Tredje', surname: 'X', sex: 'M' } })).toThrowError('redan två föräldrar');
  });

  it('creates a parent family when none exists', () => {
    const r = addRelation(db, { type: 'parent', personId: 'I5', newPerson: { givenName: 'Förälder', surname: 'En', sex: 'M' } });
    expect(r.data).toEqual({ relativeId: 'I8', familyId: 'F4' });
    const link = db.select().from(familyChildren).all().find(l => l.familyId === 'F4');
    expect(link).toMatchObject({ childId: 'I5', seq: 0 });
    expect(db.select().from(families).where(eq(families.id, 'F4')).all()[0].husbandId).toBe('I8');
  });

  it('ignores MyHeritage sentinel ids when numbering new persons', () => {
    // The real export contains I88888888 "Unassociated photos" — new ids must
    // continue the real sequence rather than jumping to I88888889.
    db.insert(persons).values({ id: 'I88888888', givenName: 'Unassociated photos', surname: '', sex: 'U' }).run();
    const r = addRelation(db, { type: 'child', personId: 'I1', familyId: 'F1', newPerson: { givenName: 'Efter', surname: 'Sentinel', sex: 'U' } });
    expect(r.data.relativeId).toBe('I9');
  });
});

describe('removeChildLink', () => {
  // delad databas i den här filen — egna id:n per test
  const setup = (n: number, extraFamily = false) => {
    const parent = `RP${n}`, child = `RC${n}`;
    db.insert(persons).values([
      { id: parent, givenName: 'Far', surname: 'Test', sex: 'M' },
      { id: child, givenName: 'Barn', surname: 'Test', sex: 'U' },
    ]).run();
    db.insert(families).values({ id: `RF${n}`, husbandId: parent, wifeId: null }).run();
    db.insert(familyChildren).values({ familyId: `RF${n}`, childId: child, seq: 3 }).run();
    if (extraFamily) {
      db.insert(families).values({ id: `RG${n}`, husbandId: parent, wifeId: null }).run();
      db.insert(familyChildren).values({ familyId: `RG${n}`, childId: child, seq: 0 }).run();
    }
    return { parent, child, family: `RF${n}`, other: `RG${n}` };
  };
  const linksFor = (childId: string) =>
    db.select().from(familyChildren).all().filter(l => l.childId === childId);

  it('tar bort barnet ur familjen men rör inte personen', () => {
    const { child, family } = setup(1);
    db.insert(events).values({ id: 9001, ownerType: 'person', ownerId: child, type: 'BIRT', dateRaw: '1800', dateYear: 1800 }).run();

    removeChildLink(db, family, child);

    expect(linksFor(child)).toEqual([]);
    expect(db.select().from(persons).all().some(p => p.id === child)).toBe(true);
    expect(db.select().from(events).all().some(e => e.id === 9001)).toBe(true);
  });

  it('lossar ur en enda familj när personen är barn i flera', () => {
    const { child, family, other } = setup(2, true);
    removeChildLink(db, family, child);
    expect(linksFor(child).map(l => l.familyId)).toEqual([other]);
  });

  it('skriver borttagningen till audit_log så den går att ångra', () => {
    const { child, family } = setup(3);
    removeChildLink(db, family, child);
    const row = db.select().from(auditLog).all().at(-1)!;
    expect(row).toMatchObject({ action: 'delete', entityType: 'familyChild', entityId: `${family}/${child}` });
    expect(JSON.parse(row.before!)).toMatchObject({ familyId: family, childId: child, seq: 3 });
  });

  it('säger ifrån när barnet inte finns i familjen', () => {
    const { family } = setup(4);
    expect(() => removeChildLink(db, family, 'RC-saknas')).toThrow(MutationError);
  });
});
