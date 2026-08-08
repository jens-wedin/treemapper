import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Issue, Severity } from '../../../lib/issues';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import { clearIssueMarks } from '../../lib/issueMarks';
import DuplicateMerge from './DuplicateMerge';

export type IssueListItem = Issue & { dismissed: boolean };

/** Each severity keeps its hue in both themes: pale wash light, deep wash dark. */
const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  dup: 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  minor: 'border-border bg-muted/50 text-foreground',
};

export default function IssueCard({ issue, onChanged }: { issue: IssueListItem; onChanged: () => void }) {
  // The tree charts mark cards from the same register — it has moved on.
  async function dismiss() {
    await mutateJson('/api/issues/dismiss', 'POST', { fingerprint: issue.fingerprint });
    clearIssueMarks();
    onChanged();
  }
  async function undismiss() {
    await mutateJson(`/api/issues/dismiss/${issue.fingerprint}`, 'DELETE');
    clearIssueMarks();
    onChanged();
  }

  return (
    <li className={`rounded-lg border p-4 ${issue.dismissed ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={SEVERITY_STYLE[issue.severity]}>
          {t(`issues.sev.${issue.severity}`)}
        </Badge>
        <span className="font-medium">{issue.category}</span>
        {issue.dismissed && <Badge variant="outline">{t('issues.dismissedBadge')}</Badge>}
      </div>

      <p className="mt-2 text-foreground">{issue.text}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/person/${issue.personIds[0]}`}>{t('issues.fix')}</Link>
        </Button>
        {issue.duplicateGroup && !issue.dismissed && (
          <DuplicateMerge group={issue.duplicateGroup} onMerged={onChanged} />
        )}
        {issue.dismissed
          ? <Button variant="outline" size="sm" onClick={undismiss}>{t('issues.undismiss')}</Button>
          : <Button variant="outline" size="sm" onClick={dismiss}>{t('issues.dismiss')}</Button>}
      </div>
    </li>
  );
}
