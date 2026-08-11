import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { issueDismissals } from '../db/schema';
import { detectIssues, summarizeByPerson, SEVERITY_ORDER, type Issue } from '../lib/issues';
import { buildIssueLog } from '../lib/issueLog';
import type { TreeResolver } from './trees';

const MAX_ITEMS = 500;
const MAX_LOG = 50;

const querySchema = z.object({
  // An issue code, e.g. `child-older-than-parents`. Kept as a plain string
  // rather than an enum of ISSUE_CODES: an unknown code should return nothing,
  // not a 400, so a stale bookmark shows an empty queue instead of an error.
  category: z.string().trim().max(80).optional(),
  severity: z.enum(['error', 'dup', 'warning', 'info', 'minor']).optional(),
  includeDismissed: z.string().optional(),
  limit: z.coerce.number().int().min(0).max(MAX_ITEMS).default(MAX_ITEMS),
});

const dismissSchema = z.object({
  fingerprint: z.string().trim().min(8).max(64),
  note: z.string().trim().max(500).optional(),
});

export function createIssuesApi(tree: TreeResolver) {
  const api = new Hono();

  api.get('/api/issues', c => {
    const { db } = tree(c);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Ogiltiga parametrar' }, 400);
    const { category, severity, includeDismissed, limit } = parsed.data;

    const dismissed = new Set(db.select().from(issueDismissals).all().map(d => d.fingerprint));
    const all = detectIssues(db);

    // Counts always describe the outstanding work, regardless of filters.
    const counts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    let outstanding = 0;
    for (const i of all) {
      if (dismissed.has(i.fingerprint)) continue;
      counts[i.code] = (counts[i.code] ?? 0) + 1;
      severityCounts[i.severity] = (severityCounts[i.severity] ?? 0) + 1;
      outstanding++;
    }

    const showDismissed = includeDismissed === '1' || includeDismissed === 'true';
    const filtered = all.filter(i =>
      (showDismissed || !dismissed.has(i.fingerprint))
      && (!category || i.code === category)
      && (!severity || i.severity === severity));

    const items = filtered.slice(0, limit).map(i => ({ ...i, dismissed: dismissed.has(i.fingerprint) }));
    return c.json({
      // Rides along rather than getting its own endpoint: resolving a
      // dismissal's fingerprint needs the detection this request already ran.
      log: buildIssueLog(db, MAX_LOG),
      items,
      counts,
      severityCounts,
      severityOrder: SEVERITY_ORDER,
      total: outstanding,
      totalAll: all.length,
      dismissed: dismissed.size,
      truncated: filtered.length > items.length,
    });
  });

  // The same detection and the same dismissals as the queue above, folded to
  // one entry per person: the tree charts mark cards from this.
  api.get('/api/issues/persons', c => {
    const { db } = tree(c);
    const dismissed = new Set(db.select().from(issueDismissals).all().map(d => d.fingerprint));
    const outstanding = detectIssues(db).filter(i => !dismissed.has(i.fingerprint));
    const persons = summarizeByPerson(outstanding);
    return c.json({ persons, total: Object.keys(persons).length });
  });

  api.post('/api/issues/dismiss', async c => {
    const { db } = tree(c);
    const parsed = dismissSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Ogiltigt fingeravtryck' }, 400);
    const { fingerprint, note } = parsed.data;
    db.insert(issueDismissals)
      .values({ fingerprint, dismissedAt: new Date().toISOString(), note: note ?? null })
      .onConflictDoUpdate({ target: issueDismissals.fingerprint, set: { dismissedAt: new Date().toISOString(), note: note ?? null } })
      .run();
    return c.json({ ok: true });
  });

  api.delete('/api/issues/dismiss/:fingerprint', c => {
    const { db } = tree(c);
    db.delete(issueDismissals).where(eq(issueDismissals.fingerprint, c.req.param('fingerprint'))).run();
    return c.json({ ok: true });
  });

  return api;
}

export type IssueListItem = Issue & { dismissed: boolean };
