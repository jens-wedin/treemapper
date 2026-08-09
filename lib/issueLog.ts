import { desc, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, issueDismissals, persons } from '../db/schema';
import { detectIssues, type Severity } from './issues';
import { eventLabelSv } from './eventLabels';

/**
 * What has been done about the problems in the queue: the edits that fixed
 * them and the ones deliberately set aside.
 *
 * There is no stored link between an edit and the issue it settled — issues
 * are computed, so a fixed one simply stops appearing. The log therefore says
 * what changed and what was dismissed, and leaves the reader to connect them.
 */
export interface IssueLogEntry {
  at: string;
  kind: 'changed' | 'dismissed';
  summary: string;
  /** The person it happened to, when the record names one. */
  personId: string | null;
  /** Dismissals only, and only while the problem still occurs. */
  category: string | null;
  severity: Severity | null;
  note: string | null;
}

const PERSON_FIELDS: Record<string, string> = {
  givenName: 'förnamn', surname: 'efternamn', marriedName: 'giftasnamn',
  suffix: 'suffix', sex: 'kön', note: 'anteckning',
};
const EVENT_FIELDS: Record<string, string> = {
  type: 'typ', dateRaw: 'datum', place: 'ort', description: 'beskrivning', age: 'ålder',
};

const show = (value: unknown): string =>
  value == null || value === '' ? '—' : `”${String(value)}”`;

const parse = (json: string | null): Record<string, unknown> | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;   // a snapshot we cannot read still deserves a log line
  }
};

/** "förnamn ”jonas” → ”Jonas”, kön — → ”M”" for the fields that moved. */
function fieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  labels: Record<string, string>,
): string {
  if (!before || !after) return '';
  return Object.entries(labels)
    .filter(([key]) => (before[key] ?? null) !== (after[key] ?? null))
    .map(([key, label]) => `${label} ${show(before[key])} → ${show(after[key])}`)
    .join(', ');
}

interface AuditRow {
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  before: string | null;
  after: string | null;
}

/** One audit row as a sentence. `nameOf` falls back to the id it is given. */
export function describeAudit(row: AuditRow, nameOf: (id: string) => string): { summary: string; personId: string | null } {
  const before = parse(row.before);
  const after = parse(row.after);
  const snapshot = after ?? before;

  if (row.action === 'merge') {
    const duplicate = before?.duplicate as { id?: string; givenName?: string; surname?: string } | undefined;
    const dupName = duplicate ? [duplicate.givenName, duplicate.surname].filter(Boolean).join(' ') : '';
    const dupId = duplicate?.id ?? '';
    return {
      summary: `Slog ihop ${[dupName, dupId && `(${dupId})`].filter(Boolean).join(' ')} med ${nameOf(row.entityId)}`.replace(/\s+/g, ' ').trim(),
      personId: row.entityId,
    };
  }

  if (row.entityType === 'event') {
    const ownerId = (snapshot?.ownerId as string | undefined) ?? null;
    const who = ownerId ? ` för ${nameOf(ownerId)}` : '';
    const label = eventLabelSv((snapshot?.type as string | undefined) ?? '');
    if (row.action === 'create') return { summary: `${label} tillagd${who}`, personId: ownerId };
    if (row.action === 'delete') return { summary: `${label} borttagen${who}`, personId: ownerId };
    const changes = fieldChanges(before, after, EVENT_FIELDS);
    return { summary: `${label}${who}: ${changes || 'uppgifter ändrade'}`, personId: ownerId };
  }

  if (row.entityType === 'media') {
    const ownerId = (snapshot?.ownerId as string | undefined) ?? null;
    const who = ownerId ? ` för ${nameOf(ownerId)}` : '';
    const title = (snapshot?.title as string | undefined) || null;
    const named = title ? `: ”${title}”` : '';
    if (row.action === 'create') return { summary: `Foto tillagt${who}${named}`, personId: ownerId };
    // The row is here in full, so a removed photo can be put back — which is
    // why the file itself is left on disk.
    if (row.action === 'delete') return { summary: `Foto borttaget${who}${named}`, personId: ownerId };
    return { summary: `Foto ändrat${who}${named}`, personId: ownerId };
  }

  if (row.entityType === 'person') {
    const changes = fieldChanges(before, after, PERSON_FIELDS);
    return { summary: `${nameOf(row.entityId)}: ${changes || 'uppgifter ändrade'}`, personId: row.entityId };
  }

  const changes = fieldChanges(before, after, {});
  return { summary: `${row.entityType} ${row.entityId}: ${changes || 'ändrad'}`, personId: null };
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

  const outstanding = dismissals.length
    ? new Map(detectIssues(db).map(i => [i.fingerprint, i]))
    : new Map();

  const changed: IssueLogEntry[] = audits.map(row => ({
    at: row.timestamp,
    kind: 'changed' as const,
    ...describeAudit(row, nameOf),
    category: null,
    severity: null,
    note: null,
  }));

  const dismissed: IssueLogEntry[] = dismissals.map(d => {
    const issue = outstanding.get(d.fingerprint);
    const personId = issue?.personIds[0] ?? null;
    return {
      at: d.dismissedAt,
      kind: 'dismissed' as const,
      // A dismissal whose problem no longer occurs has nothing left to name —
      // the data moved on, which is worth saying rather than hiding.
      summary: issue
        ? `${issue.category}${personId ? ` — ${nameOf(personId)}` : ''}`
        : 'Avfärdat problem som inte längre uppstår',
      personId,
      category: issue?.category ?? null,
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
      category: null,
      severity: null,
      note: null,
    }));
}
