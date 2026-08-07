import type { LivesStats } from '../../../lib/statistics';
import { MAX_PLAUSIBLE_AGE } from '../../../lib/statistics/lives';
import { t, displayName } from '../../lib/i18n';
import StatCard from './StatCard';
import BarChartWithTable from './BarChartWithTable';

export default function LivesSection({ stats }: { stats: LivesStats }) {
  const n = (x: number) => x.toLocaleString('sv-SE');
  return (
    <section>
      <h2 className="text-xl font-semibold">{t('statistics.lives')}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('stats.persons')} value={n(stats.total)} />
        <StatCard label={t('statistics.women')} value={n(stats.bySex.F)} />
        <StatCard label={t('statistics.men')} value={n(stats.bySex.M)} />
        <StatCard label={t('statistics.earliestBirth')} value={stats.earliestBirthYear ?? '—'} />
      </dl>

      <h3 className="mt-8 font-medium">{t('statistics.longestLives')}</h3>
      {stats.longestLives.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{t('statistics.notEnough')}</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {stats.longestLives.map(l => (
            <li key={l.id} className="flex justify-between gap-4">
              <span>
                {displayName(l)}{' '}
                <span className="text-muted-foreground">{l.birthYear}–{l.deathYear}</span>
              </span>
              <span>{l.age} {t('statistics.years')}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {t('statistics.basedOn').replace('{n}', n(stats.withBothYears))}{' '}
        {t('statistics.excludedAges').replace('{n}', String(MAX_PLAUSIBLE_AGE))}
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <BarChartWithTable
          title={t('statistics.lifespanByCentury')}
          data={stats.lifespanByCentury.map(r => ({ label: r.century, value: r.averageAge, sample: r.people }))}
          xLabel={t('statistics.century')} yLabel={t('statistics.years')}
          sampleLabel={t('statistics.people')}
        />
        <BarChartWithTable
          title={t('statistics.birthsByCentury')}
          data={stats.birthsByCentury.map(r => ({ label: r.century, value: r.births }))}
          xLabel={t('statistics.century')} yLabel={t('statistics.count')}
        />
      </div>
    </section>
  );
}
