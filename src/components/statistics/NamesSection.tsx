import type { NamesStats } from '../../../lib/statistics';
import { t, uiLocale } from '../../lib/i18n';
import { useTreeUrl } from '../../lib/treeUrl';
import RankedList from './RankedList';

export default function NamesSection({ stats }: { stats: NamesStats }) {
  const link = useTreeUrl();
  // A name in the statistics answers "how many?" and immediately asks "who?" —
  // so each links to the People list searched for that name.
  const searchName = (name: string) => link(`/people?q=${encodeURIComponent(name)}`);
  return (
    <section>
      <h2 className="text-xl font-semibold">{t('statistics.names')}</h2>
      <div className="mt-4 grid gap-8 md:grid-cols-3">
        <RankedList title={t('statistics.femaleNames')} rows={stats.femaleGiven} href={searchName} />
        <RankedList title={t('statistics.maleNames')} rows={stats.maleGiven} href={searchName} />
        <RankedList
          title={t('statistics.surnames')}
          rows={stats.surnames}
          href={searchName}
          caption={t('statistics.basedOn').replace('{n}', stats.withSurname.toLocaleString(uiLocale()))}
        />
      </div>
    </section>
  );
}
