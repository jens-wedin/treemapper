import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Severity } from '../../lib/issues';
import type { IssueLogEntry } from '../../lib/issueLog';
import { t, getLanguage , uiLocale } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { Badge } from '@/components/ui/badge';
import IssueCard, { type IssueListItem } from '../components/issues/IssueCard';
import { SEVERITY_STYLE } from '../components/issues/severityStyle';
import IssueLog from '../components/issues/IssueLog';

interface IssuesResponse {
  items: IssueListItem[];
  log: IssueLogEntry[];
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
  const severity = params.get('grad') ?? '';
  const showDismissed = params.get('avfardade') === '1';

  const [data, setData] = useState<IssuesResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(() => {
    const url = new URLSearchParams();
    if (category) url.set('category', category);
    if (severity) url.set('severity', severity);
    if (showDismissed) url.set('includeDismissed', '1');
    fetchJson<IssuesResponse>(`/api/issues?${url}`)
      .then(d => { setData(d); setState('ok'); })
      .catch(() => setState('error'));
  }, [category, severity, showDismissed]);

  useEffect(() => {
    document.title = `${t('issues.title')} – ${t('appTitle')}`;
    setState('loading');
    load();
  }, [load]);

  // Functional form on purpose: two changes in quick succession (clear the
  // category, then pick a severity) would otherwise both read the same
  // snapshot and the second would drop the first.
  function setParam(key: string, value: string) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;

  // Categories ordered worst-first, then by size.
  const ordered = data
    ? Object.entries(data.counts).sort((a, b) => b[1] - a[1])
    : [];

  // The queue arrives worst first; heading each run of one severity turns a
  // long scroll into "here are the seven real errors, then the rest".
  const groups = (data?.severityOrder ?? [])
    .map(severity => ({ severity, items: data!.items.filter(i => i.severity === severity) }))
    .filter(group => group.items.length > 0);

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('issues.title')}</h1>
      <p className="mt-1 text-muted-foreground">{t('issues.lead')}</p>
      {/* Category names and problem sentences are produced by the detectors in
          Swedish; say so rather than showing a half-translated page. */}
      {getLanguage() !== 'sv' && (
        <p className="mt-1 text-sm text-muted-foreground">{t('issues.detailsInSwedish')}</p>
      )}

      {data && (
        <p className="mt-4 rounded-lg border bg-muted/50 p-4 text-lg">
          {t('issues.remaining')
            .replace('{n}', data.total.toLocaleString(uiLocale()))
            .replace('{total}', data.totalAll.toLocaleString(uiLocale()))}
          {data.dismissed > 0 && (
            <span className="ml-2 text-sm text-muted-foreground">
              ({data.dismissed.toLocaleString(uiLocale())} {t('issues.dismissedBadge').toLowerCase()})
            </span>
          )}
        </p>
      )}

      {data && <IssueLog entries={data.log} />}

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
        <div>
          <label htmlFor="grad" className="block text-sm font-medium">{t('issues.severity')}</label>
          <select
            id="grad"
            value={severity}
            onChange={e => setParam('grad', e.target.value)}
            className="mt-1 rounded-md border px-2 py-1.5"
          >
            <option value="">{t('issues.allSeverities')}</option>
            {(data?.severityOrder ?? []).map(s => (
              <option key={s} value={s}>
                {t(`issues.sev.${s}`)} ({(data?.severityCounts[s] ?? 0).toLocaleString(uiLocale())})
              </option>
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

      <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {state === 'loading' ? t('common.loading') : data?.truncated
          ? t('issues.truncated').replace('{n}', String(data.items.length))
          : ''}
      </p>

      {data && data.items.length === 0 && state === 'ok' && (
        <p className="mt-4 text-muted-foreground">{t('issues.noIssues')}</p>
      )}

      {data && groups.length > 0 && groups.map(group => (
        <section key={group.severity} className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Badge variant="outline" className={SEVERITY_STYLE[group.severity]}>
              {t(`issues.sev.${group.severity}`)}
            </Badge>
            <span className="text-base font-normal text-muted-foreground">
              {group.items.length.toLocaleString(uiLocale())}
            </span>
          </h2>
          <ul className="mt-2 space-y-3">
            {group.items.map(issue => (
              <IssueCard key={`${issue.fingerprint}|${issue.personIds[0]}`} issue={issue} onChanged={load} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
