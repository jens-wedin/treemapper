import type { TreePerson } from '../../lib/tree';
import type { PersonIssueMark } from '../../lib/issues';
import { displayName, lifespan, formatGedcomDate, t } from '../lib/i18n';
import { BRANCH_COLORS, type Branch } from '../lib/ahnentafel';
import { apiUrl } from '../lib/api';
import CountryFlag from './CountryFlag';
import IssueBadge, { issueCategories } from './IssueBadge';

/** Up to two initials, for people without a downloaded photo. */
function initials(person: TreePerson): string {
  return [person.givenName, person.surname]
    .map(part => part.trim()[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// A hard cut mid-name reads like broken data — mark it with an ellipsis
// instead. The full name is always in the node's aria-label.
const truncate = (name: string, max: number) =>
  name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

export const COMPACT = { w: 150, h: 106, avatarR: 20, avatarCy: 32, maxName: 17 };
export const WIDE = { w: 244, h: 88, avatarR: 26, avatarCx: 34, maxName: 20 };
const FLAG_R = 8;

export interface PersonCardProps {
  person: TreePerson;
  variant: 'compact' | 'wide';
  showFlag: boolean;
  /** Chart-specific states, all optional. */
  isFocus?: boolean;
  active?: boolean;
  selected?: boolean;
  branch?: Branch;
  /** Unique per rendered card — clip paths need distinct ids. */
  idKey: string;
  /** Birth/death dates instead of just years (pedigree cards). */
  born?: string | null;
  died?: string | null;
  /** Outstanding Konsekvens problems, when "Visa konsekvenser" is on. */
  issue?: PersonIssueMark;
}

/**
 * The card drawing shared by the family and pedigree charts. Returns the
 * contents of a <g>; the caller positions it and owns the interaction props.
 */
export default function PersonCard({
  person, variant, showFlag, isFocus, active, selected, branch = 'focus', idKey, born, died, issue,
}: PersonCardProps) {
  const wide = variant === 'wide';
  const size = wide ? WIDE : COMPACT;
  const colors = BRANCH_COLORS[branch];
  const avatarCx = wide ? WIDE.avatarCx : COMPACT.w / 2;
  const avatarCy = wide ? size.h / 2 : COMPACT.avatarCy;
  const avatarR = size.avatarR;

  // Applied through `style`, not as fill/stroke attributes: var() does not
  // resolve in an SVG presentation attribute.
  const stroke = active ? 'var(--card-stroke-active)'
    : selected ? 'var(--card-stroke-selected)'
      : isFocus ? 'var(--card-stroke-focus)'
        : branch === 'focus' ? 'var(--card-stroke)' : colors.stroke;
  const fill = selected ? 'var(--card-fill-selected)'
    : branch === 'focus' ? 'var(--card-fill)' : colors.fill;

  return (
    <>
      <rect
        width={size.w}
        height={size.h}
        rx={wide ? 14 : 10}
        style={{ fill, stroke }}
        strokeWidth={isFocus || active || selected ? 2.5 : 1.5}
      />

      {person.photoId != null ? (
        <>
          <clipPath id={`avatar-${idKey}`}>
            <circle cx={avatarCx} cy={avatarCy} r={avatarR} />
          </clipPath>
          <image
            href={apiUrl(`/api/media/${person.photoId}`)}
            x={avatarCx - avatarR}
            y={avatarCy - avatarR}
            width={avatarR * 2}
            height={avatarR * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#avatar-${idKey})`}
          />
          <circle cx={avatarCx} cy={avatarCy} r={avatarR} className="fill-none" style={{ stroke: 'var(--card-avatar-ring)' }} strokeWidth={1} />
        </>
      ) : (
        <>
          <circle cx={avatarCx} cy={avatarCy} r={avatarR} style={{ fill: 'var(--card-avatar)', stroke: 'var(--card-avatar-ring)' }} strokeWidth={1} />
          <text x={avatarCx} y={avatarCy + 5} textAnchor="middle" className="fill-muted-foreground text-[14px] font-medium">
            {initials(person)}
          </text>
        </>
      )}

      {wide ? (
        <>
          <text x={WIDE.avatarCx + WIDE.avatarR + 12} y={26} className="fill-foreground text-[13px] font-medium">
            {truncate(person.givenName.trim(), WIDE.maxName)}
          </text>
          <text x={WIDE.avatarCx + WIDE.avatarR + 12} y={42} className="fill-foreground text-[13px] font-medium">
            {truncate(person.surname.trim(), WIDE.maxName)}
          </text>
          <text x={WIDE.avatarCx + WIDE.avatarR + 12} y={60} className="fill-muted-foreground text-[11px]">
            {born ? `${t('person.born')} ${formatGedcomDate(born)}` : ''}
          </text>
          <text x={WIDE.avatarCx + WIDE.avatarR + 12} y={74} className="fill-muted-foreground text-[11px]">
            {died ? `${t('person.died')} ${formatGedcomDate(died)}` : ''}
          </text>
        </>
      ) : (
        <>
          <text x={COMPACT.w / 2} y={72} textAnchor="middle" className="fill-foreground text-[13px] font-medium">
            {truncate(person.givenName.trim(), COMPACT.maxName)}
          </text>
          <text x={COMPACT.w / 2} y={87} textAnchor="middle" className="fill-foreground text-[13px] font-medium">
            {truncate(person.surname.trim(), COMPACT.maxName)}
          </text>
          <text x={COMPACT.w / 2} y={101} textAnchor="middle" className="fill-muted-foreground text-[12px]">
            {lifespan(person.birthYear, person.deathYear)}
          </text>
        </>
      )}

      {showFlag && (
        <CountryFlag
          code={person.country}
          cx={wide ? avatarCx - avatarR + 4 : avatarCx + avatarR - 4}
          cy={avatarCy + avatarR - 4}
          r={FLAG_R}
        />
      )}

      {/* top right corner, clear of the avatar and of the flag below it */}
      {issue && <IssueBadge mark={issue} cx={size.w - 13} cy={13} />}
    </>
  );
}

export const cardLabel = (person: TreePerson, issue?: PersonIssueMark): string => {
  const who = `${displayName(person)}, ${lifespan(person.birthYear, person.deathYear) || '?'}`;
  return issue ? `${who}. ${issueLabel(issue)}` : who;
};

/** "3 konsekvenser: Saknar födelse, Dödsfall utan datum" — for aria-labels. */
export function issueLabel(issue: PersonIssueMark): string {
  const count = issue.problems.length;
  const heading = t(count === 1 ? 'tree.issueOne' : 'tree.issueMany').replace('{n}', String(count));
  return `${heading}: ${issueCategories(issue).join(', ')}`;
}
