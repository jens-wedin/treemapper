import type { IssueLogEntry } from '../../../lib/issueLog';
import { t , uiLocale } from '../../lib/i18n';

/** Date and time, short — a log is read as "what did I do, and when". */
const when = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.valueOf()) ? iso : at.toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * One person's edits, newest first. The audit log holds a full before/after
 * snapshot of every change, so this can say what a value used to be — even
 * for an event that no longer exists.
 */
export default function ChangeLog({ entries }: { entries: IssueLogEntry[] }) {
  if (!entries.length) return <p className="mt-2 text-muted-foreground">{t('issues.changeLogEmpty')}</p>;
  return (
    <ol className="mt-2 space-y-2">
      {entries.map(entry => (
        <li key={`${entry.at}|${entry.summary}`} className="flex flex-wrap items-baseline gap-2 text-sm">
          <time dateTime={entry.at} className="tabular-nums text-muted-foreground">{when(entry.at)}</time>
          <span className="text-foreground">{entry.summary}</span>
        </li>
      ))}
    </ol>
  );
}
