import { desc, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, issueDismissals, persons } from '../db/schema';
import { detectIssues, type Issue, type Severity } from './issues';

/**
 * What has been done about the problems in the queue: the edits that fixed
 * them and the ones deliberately set aside.
 *
 * There is no stored link between an edit and the issue it settled — issues
 * are computed, so a fixed one simply stops appearing. The log therefore says
 * what changed and what was dismissed, and leaves the reader to connect them.
 *
 * Nothing here is stored. Every entry is derived from `audit_log` at read time,
 * which is why the wording could move to the UI without a migration.
 */

/** One field that moved, for the UI to name in the reader's language. */
export interface FieldChange {
  /** A column name — `givenName`, `dateRaw`. The dictionary has the label. */
  field: string;
  before: string | null;
  after: string | null;
}

export interface IssueLogEntry {
  at: string;
  kind: 'changed' | 'dismissed';
  /**
   * Dot-path of the sentence: `log.eventAdded` for an edit,
   * `issueTitle.missing-birth` for a dismissal. Like the detector, this file
   * reports what happened and leaves the wording to whoever is reading.
   */
  code: string;
  params: Record<string, string | number>;
  /** The fields an edit moved, listed after the sentence. */
  changes: FieldChange[];
  /** The person it happened to, when the record names one. */
  personId: string | null;
  /** Dismissals only, and only while the problem still occurs. */
  severity: Severity | null;
  note: string | null;
}

const PERSON_FIELDS = ['givenName', 'surname', 'marriedName', 'suffix', 'sex', 'note'];
const EVENT_FIELDS = ['type', 'dateRaw', 'place', 'description', 'age'];

const parse = (json: string | null): Record<string, unknown> | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;   // a snapshot we cannot read still deserves a log line
  }
};

const asText = (value: unknown): string | null =>
  value == null || value === '' ? null : String(value);

/** The fields whose value differs between the two snapshots. */
function fieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: string[],
): FieldChange[] {
  if (!before || !after) return [];
  return fields
    .filter(field => (before[field] ?? null) !== (after[field] ?? null))
    .map(field => ({ field, before: asText(before[field]), after: asText(after[field]) }));
}

interface AuditRow {
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  before: string | null;
  after: string | null;
}

/** What one audit row says happened. `nameOf` falls back to the id it is given. */
export function describeAudit(row: AuditRow, nameOf: (id: string) => string): {
  code: string;
  params: Record<string, string | number>;
  changes: FieldChange[];
  personId: string | null;
} {
  const before = parse(row.before);
  const after = parse(row.after);
  const snapshot = after ?? before;

  if (row.action === 'merge') {
    const duplicate = before?.duplicate as { id?: string; givenName?: string; surname?: string } | undefined;
    const dupName = duplicate ? [duplicate.givenName, duplicate.surname].filter(Boolean).join(' ').trim() : '';
    return {
      code: 'log.merged',
      params: { duplicate: dupName || duplicate?.id || '', id: duplicate?.id ?? '', survivor: nameOf(row.entityId) },
      changes: [],
      personId: row.entityId,
    };
  }

  if (row.entityType === 'event') {
    const ownerId = (snapshot?.ownerId as string | undefined) ?? null;
    const params = { event: (snapshot?.type as string | undefined) ?? '', name: ownerId ? nameOf(ownerId) : '' };
    if (row.action === 'create') return { code: 'log.eventAdded', params, changes: [], personId: ownerId };
    if (row.action === 'delete') return { code: 'log.eventRemoved', params, changes: [], personId: ownerId };
    return { code: 'log.eventChanged', params, changes: fieldChanges(before, after, EVENT_FIELDS), personId: ownerId };
  }

  if (row.entityType === 'media') {
    const ownerId = (snapshot?.ownerId as string | undefined) ?? null;
    const title = (snapshot?.title as string | undefined) || '';
    const params = { name: ownerId ? nameOf(ownerId) : '', title };
    const suffix = title ? 'Named' : '';
    if (row.action === 'create') return { code: `log.photoAdded${suffix}`, params, changes: [], personId: ownerId };
    // The row is here in full, so a removed photo can be put back — which is
    // why the file itself is left on disk.
    if (row.action === 'delete') return { code: `log.photoRemoved${suffix}`, params, changes: [], personId: ownerId };
    return { code: `log.photoChanged${suffix}`, params, changes: [], personId: ownerId };
  }

  if (row.entityType === 'person') {
    return {
      code: 'log.personChanged',
      params: { name: nameOf(row.entityId) },
      changes: fieldChanges(before, after, PERSON_FIELDS),
      personId: row.entityId,
    };
  }

  return {
    code: 'log.recordChanged',
    params: { entityType: row.entityType, entityId: row.entityId },
    changes: [],
    personId: null,
  };
}

/**
 * The newest `limit` entries, edits and dismissals interleaved by time.
 * Detection only runs when something has been dismissed — it is a scan of the
 * whole database, and it is the only way to say *what* a fingerprint stood for.
 */
export function buildIssueLog(db: Db, limit = 50): IssueLogEntry[] {
  const audits = db.select().from(auditLog)
    .where(ne(auditLog.action, 'import'))
    .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
    .limit(limit)
    .all();

  const dismissals = db.select().from(issueDismissals)
    .orderBy(desc(issueDismissals.dismissedAt))
    .limit(limit)
    .all();

  const names = new Map(db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname,
  }).from(persons).all().map(p => [p.id, [p.givenName, p.surname].filter(Boolean).join(' ').trim()]));
  const nameOf = (id: string) => names.get(id) || id;

  // Typed on purpose: an untyped Map made every read of an issue `any`, which
  // is how a field that no longer existed went on compiling for a while.
  const outstanding = new Map<string, Issue>(
    dismissals.length ? detectIssues(db).map(i => [i.fingerprint, i]) : [],
  );

  const changed: IssueLogEntry[] = audits.map(row => ({
    at: row.timestamp,
    kind: 'changed' as const,
    ...describeAudit(row, nameOf),
    severity: null,
    note: null,
  }));

  const dismissed: IssueLogEntry[] = dismissals.map(d => {
    const issue = outstanding.get(d.fingerprint);
    const personId = issue?.personIds[0] ?? null;
    // A dismissal whose problem no longer occurs has nothing left to name —
    // the data moved on, which is worth saying rather than hiding.
    return {
      at: d.dismissedAt,
      kind: 'dismissed' as const,
      code: issue ? `issueTitle.${issue.code}` : 'log.dismissedGone',
      params: (personId ? { name: nameOf(personId) } : {}) as Record<string, string | number>,
      changes: [],
      personId,
      severity: issue?.severity ?? null,
      note: d.note,
    };
  });

  return [...changed, ...dismissed]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/**
 * One person's own history: what has been changed about them, newest first.
 *
 * "About them" is wider than rows carrying their id. An event belongs to its
 * owner, a child link to the child, a family to its spouses, and a merge to
 * the record that stayed — so the snapshots have to be read, not just the
 * entity ids. A deleted event exists only in the before-image, which is
 * exactly when a log is worth having.
 */
export function buildPersonLog(db: Db, personId: string, limit = 25): IssueLogEntry[] {
  const names = new Map(db.select({
    id: persons.id, givenName: persons.givenName, surname: persons.surname,
  }).from(persons).all().map(p => [p.id, [p.givenName, p.surname].filter(Boolean).join(' ').trim()]));
  const nameOf = (id: string) => names.get(id) || id;

  const mentions = (row: { action: string; entityType: string; entityId: string; before: string | null; after: string | null }) => {
    if (row.action === 'import') return false;
    if (row.entityType === 'person' || row.entityType === 'family') {
      // a merge names the survivor; a family names its spouses
      if (row.entityId === personId) return true;
    }
    if (row.entityType === 'familyChild') return row.entityId.endsWith(`/${personId}`);

    const snapshot = parse(row.after) ?? parse(row.before);
    if (!snapshot) return false;
    // An event and a photo both belong to their owner, and a deleted one is
    // only in the before-image — which is exactly when the log earns its keep.
    if (row.entityType === 'event' || row.entityType === 'media') return snapshot.ownerId === personId;
    if (row.entityType === 'family') return snapshot.husbandId === personId || snapshot.wifeId === personId;
    return false;
  };

  return db.select().from(auditLog)
    .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
    .all()
    .filter(mentions)
    .slice(0, limit)
    .map(row => ({
      at: row.timestamp,
      kind: 'changed' as const,
      ...describeAudit(row, nameOf),
      personId,
      severity: null,
      note: null,
    }));
}
