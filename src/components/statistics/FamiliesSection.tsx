import type { FamiliesStats } from '../../../lib/statistics';
import { t , uiLocale } from '../../lib/i18n';
import StatCard from './StatCard';
import BarChartWithTable from './BarChartWithTable';
import { CoupleLinks } from './PersonLink';

export default function FamiliesSection({ stats }: { stats: FamiliesStats }) {
  const n = (x: number) => x.toLocaleString(uiLocale());
  return (
    <section>
      <h2 className="text-xl font-semibold">{t('statistics.families')}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('stats.families')} value={n(stats.families)} />
        <StatCard label={t('statistics.averageChildren')} value={stats.averageChildren ?? '—'} />
        {stats.marriageAge.map(m => (
          <StatCard
            key={m.sex}
            label={`${t('statistics.marriageAge')} — ${m.sex === 'F' ? t('statistics.women') : t('statistics.men')}`}
            value={`${m.averageAge} ${t('statistics.years')}`}
          />
        ))}
      </dl>
      {stats.marriagesWithYear > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('statistics.marriageAge')}: {t('statistics.basedOn').replace('{n}', n(stats.marriagesWithYear))}
        </p>
      )}

      <h3 className="mt-8 font-medium">{t('statistics.largestFamilies')}</h3>
      {stats.largestFamilies.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{t('statistics.notEnough')}</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {stats.largestFamilies.map(f => (
            <li key={f.familyId} className="flex justify-between gap-4">
              <span><CoupleLinks husband={f.husband} wife={f.wife} /></span>
              <span>{f.children} {t('statistics.children')}</span>
            </li>
          ))}
        </ol>
      )}

      <h3 className="mt-8 font-medium">{t('statistics.ageGap')}</h3>
      {stats.averageAgeGap == null ? (
        <p className="mt-2 text-muted-foreground">{t('statistics.notEnough')}</p>
      ) : (
        <p className="mt-2">
          {stats.averageAgeGap} {t('statistics.years')}
          {stats.largestAgeGap && (
            <>
              {' · '}{t('statistics.largestAgeGap')}:{' '}
              <CoupleLinks husband={stats.largestAgeGap.husband} wife={stats.largestAgeGap.wife} />{' '}
              ({stats.largestAgeGap.gap} {t('statistics.years')})
            </>
          )}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {t('statistics.basedOn').replace('{n}', n(stats.couplesWithBothBirths))}
      </p>

      <div className="mt-8">
        <BarChartWithTable
          title={t('statistics.familySizes')}
          data={stats.sizeDistribution.map(r => ({ label: r.children, value: r.families }))}
          xLabel={t('statistics.children')} yLabel={t('stats.families')}
          inline
        />
      </div>
    </section>
  );
}
