import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Issue, Severity } from '../../../lib/issues';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import DuplicateMerge from './DuplicateMerge';

export type IssueListItem = Issue & { dismissed: boolean };

const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  dup: 'border-purple-300 bg-purple-50 text-purple-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-blue-300 bg-blue-50 text-blue-900',
  minor: 'border-gray-300 bg-gray-50 text-gray-800',
};

export default function IssueCard({ issue, onChanged }: { issue: IssueListItem; onChanged: () => void }) {
  async function dismiss() {
    await mutateJson('/api/issues/dismiss', 'POST', { fingerprint: issue.fingerprint });
    onChanged();
  }
  async function undismiss() {
    await mutateJson(`/api/issues/dismiss/${issue.fingerprint}`, 'DELETE');
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

      <p className="mt-2 text-gray-800">{issue.text}</p>

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
