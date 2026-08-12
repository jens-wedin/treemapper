import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CountryFlag from '../CountryFlag';
import { t, tf, countryLabel } from '../../lib/i18n';
import { coverage, evidenceLine, strength, tierLabel } from '../../lib/countryText';
import PlaceOwners from './PlaceOwners';
import type { LearnedGroup } from '../../../lib/countryProposals';

/**
 * One piece of evidence and every place it answers.
 *
 * Grouped this way because 1 253 places is not reviewable and 402 groups is:
 * "79 places contain Bjuråker → Sweden" is a question with an obvious answer,
 * where 79 separate rows are 79 chances to stop reading.
 */
export default function EvidenceGroup({ group, busy, onApprove, onReject }: {
  group: LearnedGroup;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const country = countryLabel(group.code);
  // Named, because "Approve" on its own tells a screen reader nothing about
  // which of four hundred groups it would approve.
  const approveLabel = tf('countries.approveNamed', { country, by: group.by });
  const rejectLabel = tf('countries.rejectNamed', { country, by: group.by });

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <svg viewBox="-9 -9 18 18" className="inline-block h-4 w-4 shrink-0 align-[-2px]" aria-hidden>
              <CountryFlag code={group.code} cx={0} cy={0} r={8} />
            </svg>
            <span className="truncate">{evidenceLine(group.by, group.code)}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {coverage(group.places, group.rows)}
            {' · '}
            {strength(group.weight, group.rival)}
            {' · '}
            <Badge variant="secondary" className="align-middle">{tierLabel(group.tier)}</Badge>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} aria-label={approveLabel} onClick={onApprove}>
            {t('countries.approve')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} aria-label={rejectLabel} onClick={onReject}>
            {t('countries.reject')}
          </Button>
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {tf('countries.showPlaces', { n: group.places })}
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {group.items.map(item => (
            <li key={item.place} className="border-l-2 pl-3">
              <p className="break-words font-mono">{item.place}</p>
              <PlaceOwners owners={item.owners} more={item.moreOwners} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
