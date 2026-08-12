import { t, tf } from '../../lib/i18n';
import PlaceOwners from './PlaceOwners';
import type { UnansweredPlace } from '../../../lib/countryProposals';

/**
 * The places nothing could answer for, listed so they can be worked through.
 *
 * No buttons: there is no country to approve, and inventing one is the whole
 * thing this feature refuses to do. What it offers instead is the way in —
 * the record, and the person whose page it lives on.
 *
 * The two reasons need different work and are labelled as such. A `joined`
 * record is two places the export ran together and has to be split; a
 * `no-evidence` one just needs somebody who knows what `Stäbbgård` meant.
 */
const REASON: Record<UnansweredPlace['reason'], string> = {
  'no-evidence': 'countries.leftNoEvidence',
  joined: 'countries.leftJoined',
  rejected: 'countries.leftRejected',
  bracketed: 'countries.leftBracketed',
};

export default function LeftForYou({ places }: { places: UnansweredPlace[] }) {
  if (!places.length) return null;
  const rows = places.reduce((sum, p) => sum + p.rows, 0);

  return (
    <section className="mt-8" aria-labelledby="countries-left">
      <h2 id="countries-left" className="text-lg font-medium">{t('countries.leftTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('countries.leftLead')}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tf('countries.leftCount', { n: places.length, rows })}
      </p>

      <ul className="mt-3 space-y-2">
        {places.map(p => (
          <li key={p.place} className="rounded-lg border p-3">
            <p className="break-words font-mono text-sm">{p.place}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(REASON[p.reason])}
              {p.rows > 1 && ` · ${tf('countries.leftRows', { n: p.rows })}`}
            </p>
            <PlaceOwners owners={p.owners} more={p.moreOwners} />
          </li>
        ))}
      </ul>
    </section>
  );
}
