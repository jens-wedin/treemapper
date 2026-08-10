import { useState } from 'react';
import type { PlacesStats } from '../../../lib/statistics';
import { t, eventLabel } from '../../lib/i18n';
import PersonLink from './PersonLink';
import CountryFlag from '../CountryFlag';
import RankedList from './RankedList';

/** Which way the move went, or both. */
type Direction = 'all' | 'IMMI' | 'EMIG';

export default function PlacesSection({ stats }: { stats: PlacesStats }) {
  const asRows = (rows: { place: string; count: number }[]) => rows.map(r => ({ name: r.place, count: r.count }));
  // Filtered here rather than on the server: the whole list already arrives —
  // only the ranked lists above are cut to a top ten — so narrowing it is
  // instant and can never show a truncated answer as if it were the full one.
  const [direction, setDirection] = useState<Direction>('all');
  const shown = direction === 'all' ? stats.migrations : stats.migrations.filter(m => m.type === direction);
  return (
    <section>
      <h2 className="text-xl font-semibold">{t('statistics.places')}</h2>
      <div className="mt-4 grid gap-8 md:grid-cols-3">
        <RankedList
          title={t('statistics.birthPlaces')}
          rows={asRows(stats.birthPlaces)}
          caption={t('statistics.basedOn').replace('{n}', stats.withBirthPlace.toLocaleString('sv-SE'))}
        />
        <RankedList
          title={t('statistics.countries')}
          rows={asRows(stats.countries)}
          // Countries come back as ISO codes, so they get the same flags the
          // tree cards use rather than a second set of translated names.
          icon={code => (
            <svg viewBox="-9 -9 18 18" className="inline-block h-4 w-4 align-[-2px]" aria-hidden>
              <CountryFlag code={code} cx={0} cy={0} r={8} />
            </svg>
          )}
        />
        <RankedList title={t('statistics.occupations')} rows={asRows(stats.occupations)} />
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="font-medium">{t('statistics.migration')}</h3>
        {stats.migrations.length > 0 && (
          <span className="flex items-baseline gap-2 text-sm">
            {/* htmlFor rather than wrapping the control: a label that contains
                its select takes the chosen option into its accessible name, so
                the field announces itself as "Visa Alla (58)". */}
            <label htmlFor="migration-direction">{t('statistics.showMigration')}</label>
            {/* The counts sit in the options, so which way the family moved is
                answered before you pick anything. */}
            <select
              id="migration-direction"
              value={direction}
              onChange={e => setDirection(e.target.value as Direction)}
              className="rounded-md border px-2 py-1"
            >
              <option value="all">{t('statistics.allMigrations')} ({stats.migrations.length})</option>
              {(['IMMI', 'EMIG'] as const).map(type => (
                <option key={type} value={type}>
                  {eventLabel(type)} ({stats.migrations.filter(m => m.type === type).length})
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{t('statistics.notEnough')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((m, i) => (
            <li key={`${m.id}-${i}`}>
              {/* The event's own name, not an arrow: a bare ← left it unclear
                  whether the place was where they came from or went to. */}
              <span className="text-muted-foreground">{eventLabel(m.type)}</span>{' '}
              <PersonLink person={m} />
              {m.place && <span className="text-muted-foreground"> · {m.place}</span>}
              {m.year != null && <span className="text-muted-foreground"> · {m.year}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
