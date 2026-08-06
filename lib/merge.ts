import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events, citations, media, auditLog } from '../db/schema';
import { MutationError, isAncestor, type MutationResult } from './mutations';

type PersonField = 'givenName' | 'surname' | 'marriedName' | 'suffix' | 'sex' | 'note';

export interface MergeInput {
  survivorId: string;
  duplicateId: string;
  fieldChoices?: Partial<Record<PersonField, 'survivor' | 'duplicate'>>;
}

export interface MergeSummary {
  movedEvents: number;
  movedCitations: number;
  movedMedia: number;
  relinkedFamilies: number;
  mergedChildLinks: number;
}

const FIELDS: PersonField[] = ['givenName', 'surname', 'marriedName', 'suffix', 'sex', 'note'];
const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

/**
 * Merges `duplicateId` into `survivorId`: every event, citation, photo and
 * family link is moved to the survivor, then the duplicate row is deleted.
 *
 * Safety (spec §10, §14 — this is the one operation that can destroy family
 * data): preconditions are checked first, a complete before/after snapshot of
 * every affected row is written to audit_log, and the whole thing runs in one
 * transaction so a failure anywhere leaves the tree untouched.
 */
export function mergePersons(db: Db, input: MergeInput): MutationResult<MergeSummary> {
  const { survivorId, duplicateId, fieldChoices = {} } = input;
  if (survivorId === duplicateId) {
    throw new MutationError('Kan inte slå ihop en person med sig själv.');
  }

  return db.transaction(tx => {
    const survivor = tx.select().from(persons).where(eq(persons.id, survivorId)).all()[0];
    const duplicate = tx.select().from(persons).where(eq(persons.id, duplicateId)).all()[0];
    if (!survivor || !duplicate) throw new MutationError('Personen finns inte', 404);
    if (isAncestor(tx, survivorId, duplicateId) || isAncestor(tx, duplicateId, survivorId)) {
      throw new MutationError('Kan inte slå ihop personer i samma släktlinje.', 409);
    }

    const affectedFamilies = tx.select().from(families).where(or(
      eq(families.husbandId, survivorId), eq(families.wifeId, survivorId),
      eq(families.husbandId, duplicateId), eq(families.wifeId, duplicateId),
    )).all();
    const dupEvents = tx.select().from(events)
      .where(and(eq(events.ownerType, 'person'), eq(events.ownerId, duplicateId))).all();
    const dupCitations = tx.select().from(citations)
      .where(and(eq(citations.ownerType, 'person'), eq(citations.ownerId, duplicateId))).all();
    const dupMedia = tx.select().from(media)
      .where(and(eq(media.ownerType, 'person'), eq(media.ownerId, duplicateId))).all();
    const allChildLinks = tx.select().from(familyChildren).all()
      .filter(l => l.childId === survivorId || l.childId === duplicateId);

    // Snapshot BEFORE touching anything, so a merge can always be unwound.
    const before = {
      survivor, duplicate,
      families: affectedFamilies,
      childLinks: allChildLinks,
      events: dupEvents,
      citations: dupCitations,
      media: dupMedia,
    };

    const warnings: string[] = [];
    const summary: MergeSummary = {
      movedEvents: dupEvents.length,
      movedCitations: dupCitations.length,
      movedMedia: dupMedia.length,
      relinkedFamilies: 0,
      mergedChildLinks: 0,
    };

    // 1. Fields: survivor wins by default; explicit choice or a blank survivor
    //    value takes the duplicate's.
    const merged: Record<string, unknown> = {};
    for (const field of FIELDS) {
      const takeDuplicate = fieldChoices[field] === 'duplicate' || isBlank(survivor[field]);
      if (takeDuplicate && !isBlank(duplicate[field])) merged[field] = duplicate[field];
    }
    merged.updatedAt = new Date().toISOString();
    tx.update(persons).set(merged).where(eq(persons.id, survivorId)).run();

    // 2. Move owned records.
    tx.update(events).set({ ownerId: survivorId })
      .where(and(eq(events.ownerType, 'person'), eq(events.ownerId, duplicateId))).run();
    tx.update(citations).set({ ownerId: survivorId })
      .where(and(eq(citations.ownerType, 'person'), eq(citations.ownerId, duplicateId))).run();
    tx.update(media).set({ ownerId: survivorId })
      .where(and(eq(media.ownerType, 'person'), eq(media.ownerId, duplicateId))).run();

    // 3. Spouse slots — never let the survivor end up married to themselves.
    for (const f of affectedFamilies) {
      const patch: Record<string, string | null> = {};
      if (f.husbandId === duplicateId) {
        if (f.wifeId === survivorId) {
          patch.husbandId = null;
          warnings.push(`Partnerplatsen i familj ${f.id} tömdes: personerna var registrerade som varandras partner.`);
        } else patch.husbandId = survivorId;
      }
      if (f.wifeId === duplicateId) {
        if (f.husbandId === survivorId) {
          patch.wifeId = null;
          warnings.push(`Partnerplatsen i familj ${f.id} tömdes: personerna var registrerade som varandras partner.`);
        } else patch.wifeId = survivorId;
      }
      if (Object.keys(patch).length) {
        tx.update(families).set(patch).where(eq(families.id, f.id)).run();
        summary.relinkedFamilies++;
      }
    }

    // 4. Child links — collapse instead of duplicating when both are children
    //    of the same family.
    const survivorFamilies = new Set(allChildLinks.filter(l => l.childId === survivorId).map(l => l.familyId));
    for (const link of allChildLinks.filter(l => l.childId === duplicateId)) {
      if (survivorFamilies.has(link.familyId)) {
        tx.delete(familyChildren).where(eq(familyChildren.id, link.id)).run();
        summary.mergedChildLinks++;
      } else {
        tx.update(familyChildren).set({ childId: survivorId })
          .where(eq(familyChildren.id, link.id)).run();
        summary.relinkedFamilies++;
      }
    }

    // 5. Remove the duplicate and record the whole operation.
    tx.delete(persons).where(eq(persons.id, duplicateId)).run();

    const after = {
      survivor: tx.select().from(persons).where(eq(persons.id, survivorId)).all()[0],
      families: tx.select().from(families).where(or(
        eq(families.husbandId, survivorId), eq(families.wifeId, survivorId),
      )).all(),
      summary,
    };
    tx.insert(auditLog).values({
      timestamp: new Date().toISOString(),
      action: 'merge',
      entityType: 'person',
      entityId: survivorId,
      before: JSON.stringify(before),
      after: JSON.stringify(after),
    }).run();

    return { warnings, data: summary };
  });
}
