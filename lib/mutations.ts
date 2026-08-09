import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events, citations, sources, auditLog } from '../db/schema';
import { extractYear } from './dates';
import type { EventCreate, EventUpdate, NewPerson, PersonUpdate, RelationInput, SourceUpdate } from './schemas';

export class MutationError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}
export interface MutationResult<T = null> { warnings: string[]; data: T }

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function audit(tx: Tx, action: 'create' | 'update' | 'delete', entityType: string, entityId: string | number, before: unknown, after: unknown) {
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

export function updateSource(db: Db, id: string, patch: SourceUpdate): MutationResult {
  return db.transaction(tx => {
    const before = tx.select().from(sources).where(eq(sources.id, id)).all()[0];
    if (!before) throw new MutationError('Källan finns inte', 404);
    tx.update(sources).set(patch).where(eq(sources.id, id)).run();
    const after = tx.select().from(sources).where(eq(sources.id, id)).all()[0];
    audit(tx, 'update', 'source', id, before, after);
    return { warnings: [], data: null };
  });
}

function assertOwnerExists(tx: Tx, ownerType: 'person' | 'family', ownerId: string) {
  const table = ownerType === 'person' ? persons : families;
  if (!tx.select().from(table).where(eq(table.id, ownerId)).all().length) {
    throw new MutationError('Ägaren finns inte', 404);
  }
}

/**
 * A person with nobody attached yet.
 *
 * Everyone else is created through addRelation, hanging off someone who is
 * already there — which cannot start a tree that is empty. This is how the
 * first person in a new tree comes into being.
 */
export function createPerson(db: Db, input: NewPerson): MutationResult<{ id: string }> {
  return db.transaction(tx => {
    const id = nextId(tx, persons, 'I');
    tx.insert(persons).values({ id, givenName: input.givenName, surname: input.surname, sex: input.sex }).run();
    audit(tx, 'create', 'person', id, null, tx.select().from(persons).where(eq(persons.id, id)).all()[0]);
    return { warnings: [], data: { id } };
  });
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

const CYCLE_MSG = 'Detta skulle skapa en omöjlig släktlinje (personen skulle bli sin egen förfader).';

// MyHeritage seeds sentinel records far outside the real sequence (e.g.
// I88888888 "Unassociated photos"); ignore those so new ids continue the
// actual numbering instead of jumping to 88888889.
const ID_SENTINEL_FLOOR = 10_000_000;

function nextId(tx: Tx, table: typeof persons | typeof families, prefix: 'I' | 'F'): string {
  const row = tx.select({ n: sql<number>`coalesce(max(cast(substr(id, 2) as integer)), 0)` })
    .from(table)
    .where(sql`id like ${prefix + '%'} and cast(substr(id, 2) as integer) < ${ID_SENTINEL_FLOOR}`)
    .all()[0];
  return `${prefix}${(row?.n ?? 0) + 1}`;
}

function parentIdsOfTx(tx: Tx, id: string): string[] {
  const links = tx.select().from(familyChildren).where(eq(familyChildren.childId, id)).all();
  if (!links.length) return [];
  const fams = tx.select().from(families).where(inArray(families.id, links.map(l => l.familyId))).all();
  return fams.flatMap(f => [f.husbandId, f.wifeId]).filter((x): x is string => !!x);
}

export function isAncestor(tx: Tx, ancestorId: string, personId: string): boolean {
  const visited = new Set<string>();
  const queue = [personId];
  while (queue.length) {
    for (const p of parentIdsOfTx(tx, queue.pop()!)) {
      if (p === ancestorId) return true;
      if (!visited.has(p)) {
        visited.add(p);
        queue.push(p);
      }
    }
  }
  return false;
}

export function addRelation(db: Db, input: RelationInput): MutationResult<{ relativeId: string; familyId: string }> {
  return db.transaction(tx => {
    const person = tx.select().from(persons).where(eq(persons.id, input.personId)).all()[0];
    if (!person) throw new MutationError('Personen finns inte', 404);

    let relativeId: string;
    let relativeSex: 'M' | 'F' | 'U';
    if (input.relativeId) {
      const rel = tx.select().from(persons).where(eq(persons.id, input.relativeId)).all()[0];
      if (!rel) throw new MutationError('Personen finns inte', 404);
      relativeId = rel.id;
      relativeSex = rel.sex;
    } else {
      const np = input.newPerson!;
      relativeId = nextId(tx, persons, 'I');
      relativeSex = np.sex;
      tx.insert(persons).values({ id: relativeId, givenName: np.givenName, surname: np.surname, sex: np.sex }).run();
      audit(tx, 'create', 'person', relativeId, null, tx.select().from(persons).where(eq(persons.id, relativeId)).all()[0]);
    }
    if (relativeId === input.personId) throw new MutationError('En person kan inte vara sin egen släkting.');

    const createFamily = (husbandId: string | null, wifeId: string | null): string => {
      const fid = nextId(tx, families, 'F');
      tx.insert(families).values({ id: fid, husbandId, wifeId }).run();
      audit(tx, 'create', 'family', fid, null, tx.select().from(families).where(eq(families.id, fid)).all()[0]);
      return fid;
    };
    // Slot placement: M→husband, F→wife, U→husband (the other party takes the rest).
    const slotsFor = (id: string, sex: string): { husbandId: string | null; wifeId: string | null } =>
      sex === 'F' ? { husbandId: null, wifeId: id } : { husbandId: id, wifeId: null };

    const fillSpouseSlot = (familyId: string, memberId: string, memberSex: string, fullMessage: string) => {
      const before = tx.select().from(families).where(eq(families.id, familyId)).all()[0]!;
      const free = memberSex === 'F'
        ? (!before.wifeId ? 'wifeId' : !before.husbandId ? 'husbandId' : null)
        : (!before.husbandId ? 'husbandId' : !before.wifeId ? 'wifeId' : null);
      if (!free) throw new MutationError(fullMessage, 409);
      const patch = free === 'husbandId' ? { husbandId: memberId } : { wifeId: memberId };
      tx.update(families).set(patch).where(eq(families.id, familyId)).run();
      audit(tx, 'update', 'family', familyId, before, tx.select().from(families).where(eq(families.id, familyId)).all()[0]);
    };

    const addChildLink = (familyId: string, childId: string) => {
      const links = tx.select().from(familyChildren).where(eq(familyChildren.familyId, familyId)).all();
      if (links.some(l => l.childId === childId)) throw new MutationError('Personen är redan barn i den här familjen.', 409);
      const seq = links.length ? Math.max(...links.map(l => l.seq)) + 1 : 0;
      tx.insert(familyChildren).values({ familyId, childId, seq }).run();
      audit(tx, 'create', 'family_child', `${familyId}:${childId}`, null, { familyId, childId, seq });
    };

    let familyId: string;
    if (input.type === 'child') {
      if (isAncestor(tx, relativeId, input.personId)) throw new MutationError(CYCLE_MSG, 409);
      const own = tx.select().from(families)
        .where(or(eq(families.husbandId, input.personId), eq(families.wifeId, input.personId))).all();
      if (input.familyId) {
        const f = own.find(f => f.id === input.familyId);
        if (!f) throw new MutationError('Familjen finns inte', 404);
        familyId = f.id;
      } else if (own.length === 1) {
        familyId = own[0]!.id;
      } else if (own.length === 0) {
        const slots = slotsFor(input.personId, person.sex);
        familyId = createFamily(slots.husbandId, slots.wifeId);
      } else {
        throw new MutationError('Ange vilken familj barnet ska läggas i.');
      }
      addChildLink(familyId, relativeId);
    } else if (input.type === 'spouse') {
      const own = tx.select().from(families)
        .where(or(eq(families.husbandId, input.personId), eq(families.wifeId, input.personId))).all();
      if (own.some(f =>
        (f.husbandId === input.personId && f.wifeId === relativeId) ||
        (f.wifeId === input.personId && f.husbandId === relativeId))) {
        throw new MutationError('Personerna är redan partner.', 409);
      }
      if (input.familyId) {
        const f = own.find(f => f.id === input.familyId);
        if (!f) throw new MutationError('Familjen finns inte', 404);
        fillSpouseSlot(f.id, relativeId, relativeSex, 'Familjen har redan två partner.');
        familyId = f.id;
      } else {
        const slots = slotsFor(input.personId, person.sex);
        familyId = slots.husbandId
          ? createFamily(slots.husbandId, relativeId)
          : createFamily(relativeId, slots.wifeId);
      }
    } else {
      if (isAncestor(tx, input.personId, relativeId)) throw new MutationError(CYCLE_MSG, 409);
      const links = tx.select().from(familyChildren).where(eq(familyChildren.childId, input.personId)).all();
      const parentFams = links.length
        ? tx.select().from(families).where(inArray(families.id, links.map(l => l.familyId))).all()
        : [];
      if (parentFams.some(f => f.husbandId === relativeId || f.wifeId === relativeId)) {
        throw new MutationError('Personen är redan förälder.', 409);
      }
      const target = input.familyId
        ? parentFams.find(f => f.id === input.familyId)
        : parentFams.find(f => !f.husbandId || !f.wifeId);
      if (input.familyId && !target) throw new MutationError('Familjen finns inte', 404);
      if (!target && parentFams.length) throw new MutationError('Personen har redan två föräldrar.', 409);
      if (target) {
        fillSpouseSlot(target.id, relativeId, relativeSex, 'Familjen har redan två föräldrar.');
        familyId = target.id;
      } else {
        const slots = slotsFor(relativeId, relativeSex);
        familyId = createFamily(slots.husbandId, slots.wifeId);
        addChildLink(familyId, input.personId);
      }
    }
    return { warnings: [], data: { relativeId, familyId } };
  });
}

/**
 * Removes a child from a family. The link is the only thing deleted: the
 * person, their events and their own families stay untouched.
 *
 * This exists because an import can place someone as a child of a family they
 * are also a spouse in — a person recorded as their own parent. Nothing else
 * can be done with such a record: merging it refuses (same ancestry line), and
 * the charts have to guard against the cycle on every draw.
 */
export function removeChildLink(db: Db, familyId: string, childId: string): MutationResult {
  return db.transaction(tx => {
    const link = tx.select().from(familyChildren)
      .where(and(eq(familyChildren.familyId, familyId), eq(familyChildren.childId, childId)))
      .all()[0];
    if (!link) throw new MutationError('Barnet finns inte i familjen', 404);

    tx.delete(familyChildren).where(eq(familyChildren.id, link.id)).run();
    audit(tx, 'delete', 'familyChild', `${familyId}/${childId}`, link, null);
    return { warnings: [], data: null };
  });
}
