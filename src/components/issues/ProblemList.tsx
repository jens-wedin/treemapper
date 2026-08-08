import { Badge } from '@/components/ui/badge';
import type { PersonIssueMark } from '../../../lib/issues';
import { t } from '../../lib/i18n';
import { groupProblems } from '../../lib/issueMarks';
import { SEVERITY_STYLE } from './severityStyle';

/**
 * One person's outstanding problems, in Konsekvensbänken's own words. Callers
 * supply the surrounding section and heading, because the tree panel and the
 * person page set their headings at different levels.
 *
 * Repeats of a category are gathered under one heading: four children born
 * after the same father died is one fact told four times.
 */
export default function ProblemList({ mark }: { mark: PersonIssueMark }) {
  return (
    <ul className="mt-2 space-y-2">
      {groupProblems(mark).map(group => (
        <li key={group.category} className="rounded-md border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={SEVERITY_STYLE[group.severity]}>
              {t(`issues.sev.${group.severity}`)}
            </Badge>
            <span className="font-medium">{group.category}</span>
            {group.texts.length > 1 && (
              <span className="text-muted-foreground">({group.texts.length})</span>
            )}
          </div>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {group.texts.map((text, i) => <li key={i}>{text}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}
