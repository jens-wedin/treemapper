import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { StatisticsData } from '../../lib/statistics';
import { t, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';

export default function StatisticsPage() {
  const [params] = useSearchParams();
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
      {state === 'loading' && !data && <p className="mt-4">{t('common.loading')}</p>}
      {data && (
        <div className="mt-8 space-y-12">
          <h2 className="text-xl font-semibold">{t('statistics.lives')}</h2>
          <h2 className="text-xl font-semibold">{t('statistics.names')}</h2>
          <h2 className="text-xl font-semibold">{t('statistics.families')}</h2>
          <h2 className="text-xl font-semibold">{t('statistics.places')}</h2>
        </div>
      )}
    </section>
  );
}
