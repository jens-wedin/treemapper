import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { SourceFull } from '../../lib/sources';
import { sourceUpdateSchema } from '../../lib/schemas';
import { t } from '../lib/i18n';
import { fetchJson, mutateJson } from '../lib/api';

const emptyToNull = (v: string) => (v.trim() === '' ? null : v.trim());

function SourceEditForm({ source, onSaved, onCancel }: {
  source: SourceFull['source'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: source.title ?? '',
    author: source.author ?? '',
    publication: source.publication ?? '',
    note: source.note ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = sourceUpdateSchema.safeParse({
      title: emptyToNull(form.title),
      author: emptyToNull(form.author),
      publication: emptyToNull(form.publication),
      note: emptyToNull(form.note),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ogiltiga fält');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutateJson(`/api/sources/${source.id}`, 'PATCH', parsed.data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        {([
          ['kalla-titel', t('person.name'), 'title', 'w-80'],
          ['kalla-forfattare', t('sources.author'), 'author', 'w-64'],
          ['kalla-utgivare', t('sources.publication'), 'publication', 'w-64'],
        ] as const).map(([id, label, key, width]) => (
          <div key={id}>
            <label htmlFor={id} className="block text-sm font-medium">{label}</label>
            <Input id={id} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={`mt-1 ${width}`} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <label htmlFor="kalla-anteckning" className="block text-sm font-medium">{t('edit.note')}</label>
        <Textarea id="kalla-anteckning" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="mt-1" rows={5} />
      </div>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>{t('edit.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}

export default function SourcePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SourceFull | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    fetchJson<SourceFull>(`/api/sources/${id}/full`)
      .then(d => {
        setData(d);
        setState('ok');
        document.title = `${d.source.title ?? d.source.id} – ${t('appTitle')}`;
      })
      .catch(err => setState(err instanceof Error && err.message === 'HTTP 404' ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    setState('loading');
    setData(null);
    setEditing(false);
    load();
  }, [id, load]);

  if (state === 'loading') return <div className="space-y-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-40 w-full" /></div>;
  if (state === 'missing') {
    return <p>{t('sources.notFound')} <Link className="underline" to="/kallor">{t('sources.backToSources')}</Link></p>;
  }
  if (state === 'error' || !data) return <p role="alert">{t('common.error')}</p>;

  const { source, citations, citationTotal } = data;

  return (
    <article>
      <header>
        <h1 className="text-2xl font-bold">{source.title ?? source.id}</h1>
        <p className="mt-1 text-gray-600">
          {[source.author, source.publication].filter(Boolean).join(' · ') || '–'}
        </p>
        <p className="mt-2">
          <Button variant="outline" size="sm" aria-expanded={editing} onClick={() => setEditing(v => !v)}>
            {t('edit.edit')}
          </Button>
        </p>
        {editing && (
          <SourceEditForm
            source={source}
            onSaved={() => { setEditing(false); load(); }}
            onCancel={() => setEditing(false)}
          />
        )}
      </header>

      {source.note && !editing && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">{t('edit.note')}</h2>
          <p className="mt-2 whitespace-pre-line text-gray-700">{source.note}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          {t('sources.citations')} <span className="font-normal text-gray-500">({citationTotal})</span>
        </h2>
        {citations.length === 0 && <p className="mt-2 text-gray-600">{t('sources.none')}</p>}
        {citations.length > 0 && (
          <>
            <ul className="mt-3 space-y-2">
              {citations.map(c => (
                <li key={c.id} className="border-b pb-2">
                  {c.personId
                    ? <Link to={`/person/${c.personId}`} className="text-blue-700 underline-offset-2 hover:underline">{c.label}</Link>
                    : <span>{c.label}</span>}
                  {c.page && <span className="ml-2 text-sm text-gray-600">{t('sources.page')}: {c.page}</span>}
                  {c.quality != null && <span className="ml-2 text-sm text-gray-500">{t('person.quality')} {c.quality}</span>}
                  {c.text && <div className="mt-1 whitespace-pre-line text-sm text-gray-500">{c.text}</div>}
                </li>
              ))}
            </ul>
            {citationTotal > citations.length && (
              <p className="mt-3 text-sm text-gray-600">
                {t('sources.truncated').replace('{n}', String(citations.length))}
              </p>
            )}
          </>
        )}
      </section>
    </article>
  );
}
