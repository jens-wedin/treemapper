import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Severity } from '../../lib/issues';
import { t } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import IssueCard, { type IssueListItem } from '../components/issues/IssueCard';

interface IssuesResponse {
  items: IssueListItem[];
  counts: Record<string, number>;
  severityCounts: Record<string, number>;
  severityOrder: Severity[];
  total: number;
  totalAll: number;
  dismissed: number;
  truncated: boolean;
}

export default function IssuesPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('kategori') ?? '';
  const showDismissed = params.get('avfardade') === '1';

  const [data, setData] = useState<IssuesResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(() => {
    const url = new URLSearchParams();
    if (category) url.set('category', category);
    if (showDismissed) url.set('includeDismissed', '1');
    fetchJson<IssuesResponse>(`/api/issues?${url}`)
      .then(d => { setData(d); setState('ok'); })
      .catch(() => setState('error'));
  }, [category, showDismissed]);

  useEffect(() => {
    document.title = `${t('issues.title')} – ${t('appTitle')}`;
    setState('loading');
    load();
  }, [load]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;

  // Categories ordered worst-first, then by size.
  const ordered = data
    ? Object.entries(data.counts).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('issues.title')}</h1>
      <p className="mt-1 text-gray-600">{t('issues.lead')}</p>

      {data && (
        <p className="mt-4 rounded-lg border bg-gray-50 p-4 text-lg">
          {t('issues.remaining')
            .replace('{n}', data.total.toLocaleString('sv-SE'))
            .replace('{total}', data.totalAll.toLocaleString('sv-SE'))}
          {data.dismissed > 0 && (
            <span className="ml-2 text-sm text-gray-600">
              ({data.dismissed.toLocaleString('sv-SE')} {t('issues.dismissedBadge').toLowerCase()})
            </span>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="kategori" className="block text-sm font-medium">{t('issues.category')}</label>
          <select
            id="kategori"
            value={category}
            onChange={e => setParam('kategori', e.target.value)}
            className="mt-1 max-w-md rounded-md border px-2 py-1.5"
          >
            <option value="">{t('issues.allCategories')}</option>
            {ordered.map(([cat, n]) => (
              <option key={cat} value={cat}>{cat} ({n})</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={e => setParam('avfardade', e.target.checked ? '1' : '')}
          />
          {t('issues.showDismissed')}
        </label>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-gray-600">
        {state === 'loading' ? t('common.loading') : data?.truncated
          ? t('issues.truncated').replace('{n}', String(data.items.length))
          : ''}
      </p>

      {data && data.items.length === 0 && state === 'ok' && (
        <p className="mt-4 text-gray-600">{t('issues.noIssues')}</p>
      )}

      {data && data.items.length > 0 && (
        <ul className="mt-2 space-y-3">
          {data.items.map(issue => (
            <IssueCard key={issue.fingerprint + issue.personIds[0]} issue={issue} onChanged={load} />
          ))}
        </ul>
      )}
    </section>
  );
}
