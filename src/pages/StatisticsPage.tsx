import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { StatisticsData } from '../../lib/statistics';
import { t, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import PersonSearch from '../components/PersonSearch';
import LivesSection from '../components/statistics/LivesSection';
import NamesSection from '../components/statistics/NamesSection';
import FamiliesSection from '../components/statistics/FamiliesSection';
import PlacesSection from '../components/statistics/PlacesSection';

export default function StatisticsPage() {
  const [params, setParams] = useSearchParams();
  const person = params.get('person');
  const [data, setData] = useState<StatisticsData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  // The previous figures stay on screen while the next scope loads, the way
  // the tree page keeps its chart — blanking made every change flash.
  useEffect(() => {
    let stale = false;
    setState('loading');
    fetchJson<StatisticsData>(`/api/statistics${person ? `?person=${encodeURIComponent(person)}` : ''}`)
      .then(d => { if (!stale) { setData(d); setState('ok'); } })
      .catch(() => { if (!stale) setState('error'); });
    return () => { stale = true; };
  }, [person]);

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;

  return (
    <section aria-busy={state === 'loading' || undefined}>
      <h1 className="text-3xl font-bold">{t('statistics.title')}</h1>
      <p className="mt-1 text-muted-foreground">
        {data?.scope.kind === 'person' && data.scope.person
          ? t('statistics.scopedTo').replace('{name}', displayName(data.scope.person))
          : t('statistics.lead')}
      </p>
      <div className="mt-6 max-w-md">
        <PersonSearch
          id="stat-person"
          label={t('statistics.pickPerson')}
          picked={person}
          onPick={p => setParams({ person: p.id })}
        />
        {person && (
          <Button variant="outline" className="mt-3" onClick={() => setParams({})}>
            {t('statistics.showEveryone')}
          </Button>
        )}
      </div>

      {state === 'loading' && !data && <p className="mt-4">{t('common.loading')}</p>}
      {data && (
        <div className="mt-8 space-y-12">
          <LivesSection stats={data.lives} />
          <NamesSection stats={data.names} />
          <FamiliesSection stats={data.families} />
          <PlacesSection stats={data.places} />
        </div>
      )}
    </section>
  );
}
