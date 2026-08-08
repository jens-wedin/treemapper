import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { issueDismissals } from '../db/schema';
import { detectIssues, summarizeByPerson, SEVERITY_ORDER, type Issue } from '../lib/issues';

const MAX_ITEMS = 500;

const querySchema = z.object({
  category: z.string().trim().max(80).optional(),
  severity: z.enum(['error', 'dup', 'warning', 'info', 'minor']).optional(),
  includeDismissed: z.string().optional(),
  limit: z.coerce.number().int().min(0).max(MAX_ITEMS).default(MAX_ITEMS),
});

const dismissSchema = z.object({
  fingerprint: z.string().trim().min(8).max(64),
  note: z.string().trim().max(500).optional(),
});

export function createIssuesApi(db: Db) {
  const api = new Hono();

  api.get('/api/issues', c => {
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
      counts[i.category] = (counts[i.category] ?? 0) + 1;
      severityCounts[i.severity] = (severityCounts[i.severity] ?? 0) + 1;
      outstanding++;
    }

    const showDismissed = includeDismissed === '1' || includeDismissed === 'true';
    const filtered = all.filter(i =>
      (showDismissed || !dismissed.has(i.fingerprint))
      && (!category || i.category === category)
      && (!severity || i.severity === severity));

    const items = filtered.slice(0, limit).map(i => ({ ...i, dismissed: dismissed.has(i.fingerprint) }));
    return c.json({
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
    const dismissed = new Set(db.select().from(issueDismissals).all().map(d => d.fingerprint));
    const outstanding = detectIssues(db).filter(i => !dismissed.has(i.fingerprint));
    const persons = summarizeByPerson(outstanding);
    return c.json({ persons, total: Object.keys(persons).length });
  });

  api.post('/api/issues/dismiss', async c => {
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
    db.delete(issueDismissals).where(eq(issueDismissals.fingerprint, c.req.param('fingerprint'))).run();
    return c.json({ ok: true });
  });

  return api;
}

export type IssueListItem = Issue & { dismissed: boolean };
