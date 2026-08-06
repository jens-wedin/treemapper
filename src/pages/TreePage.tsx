import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { TreeData } from '../../lib/tree';
import { t, displayName, lifespan } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { layoutTree } from '../lib/treeLayout';
import TreeChart from '../components/TreeChart';
import TreeList from '../components/TreeList';

// Tree owner — the natural default root for /trad without an id.
const DEFAULT_FOCUS = 'I500001';
const DEPTHS = [1, 2, 3, 4, 5];

export default function TreePage() {
  const { id = DEFAULT_FOCUS } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const upp = Math.min(5, Math.max(1, Number(params.get('upp') ?? 3) || 3));
  const ned = Math.min(5, Math.max(1, Number(params.get('ned') ?? 3) || 3));
  const depthQuery = `?upp=${upp}&ned=${ned}`;

  const [data, setData] = useState<TreeData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mode, setMode] = useState<'chart' | 'list'>('chart');

  useEffect(() => {
    setState('loading');
    setData(null);
    fetchJson<TreeData>(`/api/tree/${id}?up=${upp}&down=${ned}`)
      .then(d => {
        setData(d);
        setState('ok');
        document.title = `${t('tree.title')}: ${displayName(d.focus)} – ${t('appTitle')}`;
      })
      .catch(() => setState('error'));
  }, [id, upp, ned]);

  const layout = useMemo(() => (data ? layoutTree(data) : null), [data]);

  function setDepth(key: 'upp' | 'ned', value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('tree.title')}</h1>
      {data && (
        <p className="mt-1 text-gray-600">
          {displayName(data.focus)} {lifespan(data.focus.birthYear, data.focus.deathYear)}
          {' · '}
          <Link to={`/person/${data.focus.id}`} className="text-blue-700 underline-offset-2 hover:underline">
            {t('tree.goToPerson')}
          </Link>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div role="group" aria-label={`${t('tree.chart')} / ${t('tree.list')}`} className="flex gap-1">
          <Button variant={mode === 'chart' ? 'default' : 'outline'} aria-pressed={mode === 'chart'} onClick={() => setMode('chart')}>
            {t('tree.chart')}
          </Button>
          <Button variant={mode === 'list' ? 'default' : 'outline'} aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            {t('tree.list')}
          </Button>
        </div>
        <div>
          <label htmlFor="gen-upp" className="block text-sm font-medium">{t('tree.generationsUp')}</label>
          <select id="gen-upp" value={upp} onChange={e => setDepth('upp', e.target.value)} className="mt-1 rounded-md border px-2 py-1.5">
            {DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gen-ned" className="block text-sm font-medium">{t('tree.generationsDown')}</label>
          <select id="gen-ned" value={ned} onChange={e => setDepth('ned', e.target.value)} className="mt-1 rounded-md border px-2 py-1.5">
            {DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {state === 'loading' && <p className="mt-4 text-gray-600">{t('common.loading')}</p>}
      {data && layout && (
        mode === 'chart'
          ? <TreeChart layout={layout} depthQuery={depthQuery} />
          : <TreeList ancestors={data.ancestors} descendants={data.descendants} depthQuery={depthQuery} />
      )}
    </section>
  );
}
