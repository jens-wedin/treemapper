import type { NamesStats } from '../../../lib/statistics';
import { t , uiLocale } from '../../lib/i18n';
import RankedList from './RankedList';

export default function NamesSection({ stats }: { stats: NamesStats }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{t('statistics.names')}</h2>
      <div className="mt-4 grid gap-8 md:grid-cols-3">
        <RankedList title={t('statistics.femaleNames')} rows={stats.femaleGiven} />
        <RankedList title={t('statistics.maleNames')} rows={stats.maleGiven} />
        <RankedList
          title={t('statistics.surnames')}
          rows={stats.surnames}
          caption={t('statistics.basedOn').replace('{n}', stats.withSurname.toLocaleString(uiLocale()))}
        />
      </div>
    </section>
  );
}
