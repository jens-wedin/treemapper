import { t, tf, eventLabel } from './i18n';
import type { FieldChange, IssueLogEntry } from '../../lib/issueLog';

/**
 * A change-log entry, in the reader's language.
 *
 * The log is computed from `audit_log` every time it is read, so the server can
 * report what happened — an event added, a photo removed, three fields edited —
 * and leave the sentence to be built here.
 */

/** `{event}` is a GEDCOM tag; nothing else in a log entry needs translating. */
const resolve = (params: Record<string, string | number>): Record<string, string | number> =>
  'event' in params ? { ...params, event: eventLabel(String(params.event)) } : params;

/** The headline: what happened. */
export const logSummary = (entry: IssueLogEntry): string => tf(entry.code, resolve(entry.params));

/** An empty value reads as a dash — "note — → “checked the parish book”". */
const show = (value: string | null) => (value == null ? t('log.empty') : `”${value}”`);

/** "first name ”jonas” → ”Jonas”, sex — → ”M”" for the fields that moved. */
export const logChanges = (changes: FieldChange[]): string =>
  changes.map(c => `${t(`field.${c.field}`)} ${show(c.before)} → ${show(c.after)}`).join(', ');

/**
 * The whole line. An edit whose fields all matched — a save that changed
 * nothing — still deserves a line, so it says so rather than trailing off.
 */
export function logLine(entry: IssueLogEntry): string {
  const summary = logSummary(entry);
  if (entry.kind === 'dismissed') {
    return entry.personId && entry.params.name ? `${summary} — ${entry.params.name}` : summary;
  }
  if (!entry.changes.length) return summary;
  return `${summary}: ${logChanges(entry.changes)}`;
}
