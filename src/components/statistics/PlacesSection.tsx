import type { PlacesStats } from '../../../lib/statistics';
import { t, eventLabel } from '../../lib/i18n';
import PersonLink from './PersonLink';
import CountryFlag from '../CountryFlag';
import RankedList from './RankedList';

export default function PlacesSection({ stats }: { stats: PlacesStats }) {
  const asRows = (rows: { place: string; count: number }[]) => rows.map(r => ({ name: r.place, count: r.count }));
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

      <h3 className="mt-8 font-medium">{t('statistics.migration')}</h3>
      {stats.migrations.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{t('statistics.notEnough')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {stats.migrations.map((m, i) => (
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
