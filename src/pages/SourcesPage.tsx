import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SourceListItem } from '../../lib/sources';
import { t } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { useTreeUrl } from '../lib/treeUrl';

const PAGE_SIZE = 50;
interface SourcesResult { items: SourceListItem[]; total: number }

export default function SourcesPage() {
  const link = useTreeUrl();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);

  const [form, setForm] = useState(q);
  const [result, setResult] = useState<SourcesResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => { setForm(q); }, [q]);

  useEffect(() => {
    document.title = `${t('sources.title')} – ${t('appTitle')}`;
    const url = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (q) url.set('q', q);
    setResult(null);
    setError(false);
    fetchJson<SourcesResult>(`/api/sources?${url}`).then(setResult).catch(() => setError(true));
  }, [q, offset]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (form) next.set('q', form);
    setParams(next);
  }

  function page(dir: 1 | -1) {
    const next = new URLSearchParams(params);
    next.set('offset', String(Math.max(0, offset + dir * PAGE_SIZE)));
    setParams(next);
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('sources.title')}</h1>

      <form onSubmit={submit} className="mt-4 flex items-end gap-3">
        <div>
          <label htmlFor="sok-kalla" className="block text-sm font-medium">{t('sources.search')}</label>
          <Input id="sok-kalla" value={form} onChange={e => setForm(e.target.value)} className="mt-1 w-72" />
        </div>
        <Button type="submit">{t('search.button')}</Button>
      </form>

      <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {error ? t('common.error') : result ? t('search.hits').replace('{n}', String(result.total)) : t('common.loading')}
      </p>

      {result && result.items.length > 0 && (
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-4">{t('person.name')}</th>
              <th scope="col" className="py-2 pr-4">{t('sources.author')}</th>
              <th scope="col" className="py-2 pr-4">{t('sources.publication')}</th>
              <th scope="col" className="py-2">{t('sources.count')}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map(s => (
              <tr key={s.id} className="border-b">
                <td className="py-2 pr-4">
                  <Link to={link(`/kalla/${s.id}`)} className="text-primary underline-offset-2 hover:underline">
                    {s.title ?? s.id}
                  </Link>
                </td>
                <td className="py-2 pr-4">{s.author ?? '–'}</td>
                <td className="py-2 pr-4">{s.publication ?? '–'}</td>
                <td className="py-2">{s.citationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result && result.total > PAGE_SIZE && (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" disabled={offset === 0} onClick={() => page(-1)}>{t('search.prev')}</Button>
          <Button variant="outline" disabled={offset + PAGE_SIZE >= result.total} onClick={() => page(1)}>{t('search.next')}</Button>
        </div>
      )}
    </section>
  );
}
