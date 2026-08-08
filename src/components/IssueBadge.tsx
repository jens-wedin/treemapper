import type { PersonIssueMark, Severity } from '../../lib/issues';

/** Same hues as the severity badges in Konsekvensbänken, swapped by theme. */
const FILL: Record<Severity, string> = {
  error: 'var(--issue-error)',
  dup: 'var(--issue-dup)',
  warning: 'var(--issue-warning)',
  info: 'var(--issue-info)',
  minor: 'var(--issue-minor)',
};

/** The fan has no room for a badge, so it outlines the wedge in this instead. */
export const issueColor = (severity: Severity): string => FILL[severity];

/** Every problem is counted, but the circle only has room for one digit. */
const shortCount = (count: number) => (count > 9 ? '9+' : String(count));

/** The tooltip names each kind once, however many of that kind there are. */
export const issueCategories = (mark: PersonIssueMark): string[] =>
  [...new Set(mark.problems.map(p => p.category))];

/**
 * The mark a chart card wears when someone has outstanding inconsistencies:
 * a dot in the colour of their worst one, with how many. Hidden from screen
 * readers — the card's own aria-label says the same thing in words.
 */
export default function IssueBadge({ mark, cx, cy, r = 9 }: {
  mark: PersonIssueMark;
  cx: number;
  cy: number;
  r?: number;
}) {
  const count = mark.problems.length;
  return (
    <g aria-hidden data-issue-severity={mark.severity} data-issue-count={count}>
      <title>{issueCategories(mark).join(', ')}</title>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        style={{ fill: FILL[mark.severity], stroke: 'var(--issue-ink)' }}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy + (count > 9 ? 3 : 3.5)}
        textAnchor="middle"
        style={{ fill: 'var(--issue-ink)' }}
        className={count > 9 ? 'text-[8px] font-bold' : 'text-[10px] font-bold'}
      >
        {shortCount(count)}
      </text>
    </g>
  );
}
