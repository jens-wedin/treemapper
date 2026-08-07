import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { TreeData } from '../../lib/tree';
import { t, displayName, lifespan } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { layoutTree } from '../lib/treeLayout';
import TreeChart from '../components/TreeChart';
import TreeList from '../components/TreeList';
import TreePersonPanel from '../components/TreePersonPanel';
import PedigreeChart from '../components/PedigreeChart';
import FanChart from '../components/FanChart';

// Tree owner — the natural default root for /trad without an id.
const DEFAULT_FOCUS = 'I500001';
const DEPTHS = [1, 2, 3, 4, 5];
const UP_DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8];
const VIEWS = ['family', 'pedigree', 'fan', 'list'] as const;
type View = (typeof VIEWS)[number];

export default function TreePage() {
  const { id = DEFAULT_FOCUS } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const upp = Math.min(5, Math.max(1, Number(params.get('upp') ?? 3) || 3));
  const ned = Math.min(5, Math.max(1, Number(params.get('ned') ?? 3) || 3));
  const depthQuery = `?upp=${upp}&ned=${ned}`;

  const viewParam = params.get('vy') as View | null;
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : 'family';

  const [data, setData] = useState<TreeData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

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

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  const setDepth = (key: 'upp' | 'ned', value: string) => setParam(key, value);

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
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
        <div role="group" aria-label={t('tree.viewLabel')} className="flex gap-1">
          {VIEWS.map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'outline'}
              aria-pressed={view === v}
              onClick={() => setParam('vy', v)}
            >
              {t(`tree.view${v[0]!.toUpperCase()}${v.slice(1)}`)}
            </Button>
          ))}
        </div>
        <div>
          <label htmlFor="gen-upp" className="block text-sm font-medium">{t('tree.generationsUp')}</label>
          <select id="gen-upp" value={upp} onChange={e => setDepth('upp', e.target.value)} className="mt-1 rounded-md border px-2 py-1.5">
            {UP_DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {/* descendants only matter where they are drawn */}
        {(view === 'family' || view === 'list') && (
          <div>
            <label htmlFor="gen-ned" className="block text-sm font-medium">{t('tree.generationsDown')}</label>
            <select id="gen-ned" value={ned} onChange={e => setDepth('ned', e.target.value)} className="mt-1 rounded-md border px-2 py-1.5">
              {DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        {(view === 'pedigree' || view === 'fan') && (
          <p className="text-sm text-gray-500">{t('tree.ancestorsOnly')}</p>
        )}
      </div>

      {state === 'loading' && <p className="mt-4 text-gray-600">{t('common.loading')}</p>}
      {data && layout && (
        view === 'list' ? (
          <TreeList ancestors={data.ancestors} descendants={data.descendants} depthQuery={depthQuery} />
        ) : (
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === 'family' && (
                <TreeChart layout={layout} onSelect={setSelectedId} selectedId={selectedId} />
              )}
              {view === 'pedigree' && (
                <PedigreeChart data={data} generations={upp} onSelect={setSelectedId} selectedId={selectedId} />
              )}
              {view === 'fan' && (
                <FanChart data={data} generations={upp} onSelect={setSelectedId} selectedId={selectedId} />
              )}
            </div>
            {selectedId && (
              <TreePersonPanel
                personId={selectedId}
                onClose={() => setSelectedId(null)}
                onSelect={setSelectedId}
                onFocusTree={id => { setSelectedId(null); navigate(`/trad/${id}${depthQuery}&vy=${view}`); }}
              />
            )}
          </div>
        )
      )}
    </section>
  );
}
