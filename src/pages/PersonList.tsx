import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PersonListItem } from '../../lib/queries';
import { t, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';

const PAGE_SIZE = 50;
interface SearchResult { items: PersonListItem[]; total: number }

export default function PersonList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const fodd = params.get('fodd') ?? '';
  const ort = params.get('ort') ?? '';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);

  const [form, setForm] = useState({ q, fodd, ort });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => { setForm({ q, fodd, ort }); }, [q, fodd, ort]);

  useEffect(() => {
    document.title = `${t('nav.persons')} – ${t('appTitle')}`;
    const url = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (q) url.set('q', q);
    if (fodd) url.set('birthYear', fodd);
    if (ort) url.set('place', ort);
    setResult(null);
    setError(false);
    fetchJson<SearchResult>(`/api/persons?${url}`).then(setResult).catch(() => setError(true));
  }, [q, fodd, ort, offset]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (form.q) next.set('q', form.q);
    if (form.fodd) next.set('fodd', form.fodd);
    if (form.ort) next.set('ort', form.ort);
    setParams(next);
  }

  function page(dir: 1 | -1) {
    const next = new URLSearchParams(params);
    next.set('offset', String(Math.max(0, offset + dir * PAGE_SIZE)));
    setParams(next);
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('nav.persons')}</h1>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="sok-namn" className="block text-sm font-medium">{t('search.name')}</label>
          <Input id="sok-namn" value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} className="mt-1 w-64" />
        </div>
        <div>
          <label htmlFor="sok-fodd" className="block text-sm font-medium">{t('search.birthYear')}</label>
          <Input id="sok-fodd" inputMode="numeric" value={form.fodd} onChange={e => setForm({ ...form, fodd: e.target.value })} className="mt-1 w-28" />
        </div>
        <div>
          <label htmlFor="sok-ort" className="block text-sm font-medium">{t('search.place')}</label>
          <Input id="sok-ort" value={form.ort} onChange={e => setForm({ ...form, ort: e.target.value })} className="mt-1 w-56" />
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
              <th scope="col" className="py-2 pr-4">{t('person.born')}</th>
              <th scope="col" className="py-2 pr-4">{t('person.died')}</th>
              <th scope="col" className="py-2">{t('person.birthPlace')}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map(p => (
              <tr key={p.id} className="border-b">
                <td className="py-2 pr-4">
                  <Link to={`/person/${p.id}`} className="text-primary underline-offset-2 hover:underline">
                    {displayName(p)}
                  </Link>
                </td>
                <td className="py-2 pr-4">{p.birthYear ?? '–'}</td>
                <td className="py-2 pr-4">{p.deathYear ?? '–'}</td>
                <td className="py-2">{p.birthPlace ?? '–'}</td>
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
