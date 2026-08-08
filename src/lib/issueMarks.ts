import { useEffect, useState } from 'react';
import type { PersonIssueMark, Severity } from '../../lib/issues';
import { fetchJson } from './api';

export type IssueMarks = Record<string, PersonIssueMark>;

const NONE: IssueMarks = Object.freeze({});

// Detecting issues means scanning every person, family and event — around half
// a second on the real database. The charts ask for the register once and share
// the answer; dismissing something in Konsekvensbänken drops it (see below).
let cached: Promise<IssueMarks> | null = null;

function load(): Promise<IssueMarks> {
  cached ??= fetchJson<{ persons: IssueMarks }>('/api/issues/persons')
    .then(body => body.persons)
    .catch(() => {
      cached = null;             // a failed fetch must not stick for the session
      return NONE;
    });
  return cached;
}

/**
 * The same problems arranged for reading: one heading per category, the
 * wordings under it. Four children born after the same father's death is one
 * fact told four times, not four headings.
 *
 * Client-side on purpose — `lib/issues.ts` reaches for node:crypto and the
 * database schema, and importing a value from it drags both into the bundle.
 */
export function groupProblems(mark: PersonIssueMark): { severity: Severity; category: string; texts: string[] }[] {
  const groups: { severity: Severity; category: string; texts: string[] }[] = [];
  for (const problem of mark.problems) {
    const group = groups.find(g => g.category === problem.category)
      ?? (groups.push({ severity: problem.severity, category: problem.category, texts: [] }), groups[groups.length - 1]!);
    if (problem.text) group.texts.push(problem.text);
  }
  return groups;
}

/** Called after dismissing, restoring or merging: the register has moved on. */
export function clearIssueMarks(): void {
  cached = null;
}

/**
 * Which people in the tree carry outstanding inconsistencies. Empty while the
 * register loads and whenever the setting is off, so charts can read it
 * unconditionally.
 */
export function useIssueMarks(enabled: boolean): IssueMarks {
  const [marks, setMarks] = useState<IssueMarks>(NONE);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then(loaded => { if (live) setMarks(loaded); });
    return () => { live = false; };
  }, [enabled]);
  return enabled ? marks : NONE;
}
