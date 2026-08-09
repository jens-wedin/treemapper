import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import type { IssueLogEntry } from '../../../lib/issueLog';
import { t } from '../../lib/i18n';
import { SEVERITY_STYLE } from './severityStyle';
import { useTreeUrl } from '../../lib/treeUrl';

/** Date and time, short — the log is read as "what did I do last night". */
const when = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.valueOf()) ? iso : at.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * What has been done about the queue: edits that fixed problems, and problems
 * deliberately set aside. Collapsed by default so the queue stays the page.
 */
export default function IssueLog({ entries }: { entries: IssueLogEntry[] }) {
  const link = useTreeUrl();
  return (
    <details className="mt-4 rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {t('issues.log')}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({entries.length.toLocaleString('sv-SE')})
        </span>
      </summary>

      <p className="mt-2 text-sm text-muted-foreground">{t('issues.logLead')}</p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('issues.logEmpty')}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.map(entry => (
            <li key={`${entry.at}|${entry.kind}|${entry.summary}`} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <time dateTime={entry.at} className="tabular-nums text-muted-foreground">{when(entry.at)}</time>
                <Badge
                  variant="outline"
                  className={entry.kind === 'dismissed' && entry.severity
                    ? SEVERITY_STYLE[entry.severity]
                    : undefined}
                >
                  {t(entry.kind === 'dismissed' ? 'issues.logSkipped' : 'issues.logFixed')}
                </Badge>
                <span className="text-foreground">
                  {entry.personId
                    ? <Link to={link(`/person/${entry.personId}`)} className="text-primary underline-offset-2 hover:underline">{entry.summary}</Link>
                    : entry.summary}
                </span>
              </div>
              {entry.note && <p className="ml-1 text-muted-foreground">”{entry.note}”</p>}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
