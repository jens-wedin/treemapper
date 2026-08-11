import { useEffect, useState } from 'react';
import type { IssueCode, PersonIssueMark, Severity } from '../../lib/issues';
import { fetchJson } from './api';
import { issueText, issueTitle } from './issueText';

export type IssueMarks = Record<string, PersonIssueMark>;

/** One kind of problem a person has, with every wording of it under one heading. */
export interface ProblemGroup {
  severity: Severity;
  code: IssueCode;
  /** Already translated — the caller is rendering, not deciding. */
  title: string;
  texts: string[];
}

const NONE: IssueMarks = Object.freeze({});

// Detecting issues means scanning every person, family and event — around half
// a second on the real database. The charts ask for the register once and share
// the answer; dismissing something in Konsekvensbänken drops it (see below).
let cached: Promise<IssueMarks> | null = null;
const listeners = new Set<() => void>();

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
export function groupProblems(mark: PersonIssueMark): ProblemGroup[] {
  const groups: ProblemGroup[] = [];
  for (const problem of mark.problems) {
    const group = groups.find(g => g.code === problem.code)
      ?? (groups.push({ severity: problem.severity, code: problem.code, title: issueTitle(problem.code), texts: [] }), groups[groups.length - 1]!);
    group.texts.push(issueText(problem.code, problem.params));
  }
  return groups;
}

/**
 * Called after dismissing, restoring, merging or editing: the register has
 * moved on. Anything showing marks refetches, so a problem you just fixed
 * stops being reported without a reload.
 */
export function clearIssueMarks(): void {
  cached = null;
  listeners.forEach(notify => notify());
}

/**
 * Which people in the tree carry outstanding inconsistencies. Empty while the
 * register loads and whenever the setting is off, so charts can read it
 * unconditionally.
 */
export function useIssueMarks(enabled: boolean): IssueMarks {
  const [marks, setMarks] = useState<IssueMarks>(NONE);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then(loaded => { if (live) setMarks(loaded); });
    return () => { live = false; };
  }, [enabled, version]);

  return enabled ? marks : NONE;
}
