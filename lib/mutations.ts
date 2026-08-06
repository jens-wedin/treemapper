import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, events, citations, auditLog } from '../db/schema';
import { extractYear } from './dates';
import type { EventCreate, EventUpdate, PersonUpdate } from './schemas';

export class MutationError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}
export interface MutationResult<T = null> { warnings: string[]; data: T }

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function audit(tx: Tx, action: 'create' | 'update' | 'delete', entityType: string, entityId: string | number, before: unknown, after: unknown) {
  tx.insert(auditLog).values({
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId: String(entityId),
    before: before == null ? null : JSON.stringify(before),
    after: after == null ? null : JSON.stringify(after),
  }).run();
}

// Spec §10: fuzzy genealogy dates are legitimate — unparseable input is
// saved verbatim with a warning, never rejected.
function dateWarnings(dateRaw: string | null | undefined): string[] {
  return dateRaw && extractYear(dateRaw) == null
    ? ['Datumet kunde inte tolkas – året lämnas tomt.']
    : [];
}

export function updatePerson(db: Db, id: string, patch: PersonUpdate): MutationResult {
  return db.transaction(tx => {
    const before = tx.select().from(persons).where(eq(persons.id, id)).all()[0];
    if (!before) throw new MutationError('Personen finns inte', 404);
    tx.update(persons).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(persons.id, id)).run();
    const after = tx.select().from(persons).where(eq(persons.id, id)).all()[0];
    audit(tx, 'update', 'person', id, before, after);
    return { warnings: [], data: null };
  });
}

function assertOwnerExists(tx: Tx, ownerType: 'person' | 'family', ownerId: string) {
  const table = ownerType === 'person' ? persons : families;
  if (!tx.select().from(table).where(eq(table.id, ownerId)).all().length) {
    throw new MutationError('Ägaren finns inte', 404);
  }
}

export function createEvent(db: Db, input: EventCreate): MutationResult<{ id: number }> {
  return db.transaction(tx => {
    assertOwnerExists(tx, input.ownerType, input.ownerId);
    const row = { ...input, dateYear: extractYear(input.dateRaw) };
    const inserted = tx.insert(events).values(row).returning({ id: events.id }).all()[0]!;
    audit(tx, 'create', 'event', inserted.id, null, { ...row, id: inserted.id });
    return { warnings: dateWarnings(input.dateRaw), data: { id: inserted.id } };
  });
}

export function updateEvent(db: Db, id: number, patch: EventUpdate): MutationResult {
  return db.transaction(tx => {
    const before = tx.select().from(events).where(eq(events.id, id)).all()[0];
    if (!before) throw new MutationError('Händelsen finns inte', 404);
    const set = { ...patch, ...(patch.dateRaw !== undefined ? { dateYear: extractYear(patch.dateRaw) } : {}) };
    tx.update(events).set(set).where(eq(events.id, id)).run();
    const after = tx.select().from(events).where(eq(events.id, id)).all()[0];
    audit(tx, 'update', 'event', id, before, after);
    return { warnings: patch.dateRaw !== undefined ? dateWarnings(patch.dateRaw) : [], data: null };
  });
}

export function deleteEvent(db: Db, id: number): MutationResult {
  return db.transaction(tx => {
    const before = tx.select().from(events).where(eq(events.id, id)).all()[0];
    if (!before) throw new MutationError('Händelsen finns inte', 404);
    const cits = tx.select().from(citations)
      .where(and(eq(citations.ownerType, 'event'), eq(citations.ownerId, String(id)))).all();
    for (const c of cits) {
      tx.delete(citations).where(eq(citations.id, c.id)).run();
      audit(tx, 'delete', 'citation', c.id, c, null);
    }
    tx.delete(events).where(eq(events.id, id)).run();
    audit(tx, 'delete', 'event', id, before, null);
    return { warnings: [], data: null };
  });
}
