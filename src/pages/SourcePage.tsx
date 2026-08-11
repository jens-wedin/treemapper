import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { SourceFull } from '../../lib/sources';
import { sourceUpdateSchema } from '../../lib/schemas';
import { t } from '../lib/i18n';
import { ApiError, fetchJson, mutateJson } from '../lib/api';
import { useTreeUrl } from '../lib/treeUrl';
import RichText from '../components/RichText';
import DeleteSourceButton from '../components/edit/DeleteSourceButton';
import AddCitationToSource from '../components/edit/AddCitationToSource';
import RemoveCitationButton from '../components/edit/RemoveCitationButton';

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
    transcription: source.transcription ?? '',
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
      transcription: emptyToNull(form.transcription),
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
          ['source-titel', t('person.name'), 'title', 'w-80'],
          ['source-forfattare', t('sources.author'), 'author', 'w-64'],
          ['source-utgivare', t('sources.publication'), 'publication', 'w-64'],
        ] as const).map(([id, label, key, width]) => (
          <div key={id}>
            <label htmlFor={id} className="block text-sm font-medium">{label}</label>
            <Input id={id} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={`mt-1 ${width}`} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        {/* Tall by default: this is where a whole document goes, and a box that
            shows four lines of forty invites you to stop after four. */}
        <label htmlFor="kalla-transkription" className="block text-sm font-medium">{t('sources.transcription')}</label>
        <Textarea
          id="kalla-transkription"
          value={form.transcription}
          onChange={e => setForm({ ...form, transcription: e.target.value })}
          className="mt-1 font-mono text-sm"
          rows={18}
        />
        <p className="mt-1 text-sm text-muted-foreground">{t('sources.transcriptionHint')}</p>
      </div>
      <div className="mt-3">
        <label htmlFor="kalla-anteckning" className="block text-sm font-medium">{t('edit.note')}</label>
        <Textarea id="kalla-anteckning" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="mt-1" rows={4} />
      </div>
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>{t('edit.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}

export default function SourcePage() {
  const link = useTreeUrl();
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
      .catch(err => setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    setState('loading');
    setData(null);
    setEditing(false);
    load();
  }, [id, load]);

  if (state === 'loading') return <div className="space-y-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-40 w-full" /></div>;
  if (state === 'missing') {
    return <p>{t('sources.notFound')} <Link className="underline" to={link('/sources')}>{t('sources.backToSources')}</Link></p>;
  }
  if (state === 'error' || !data) return <p role="alert">{t('common.error')}</p>;

  const { source, citations, citationTotal } = data;

  return (
    <article>
      <header>
        <h1 className="text-2xl font-bold">{source.title ?? source.id}</h1>
        <p className="mt-1 text-muted-foreground">
          {[source.author, source.publication].filter(Boolean).join(' · ') || '–'}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" aria-expanded={editing} onClick={() => setEditing(v => !v)}>
            {t('edit.edit')}
          </Button>
          <DeleteSourceButton id={source.id} title={source.title ?? source.id} citationCount={citationTotal} />
        </p>
        {editing && (
          <SourceEditForm
            source={source}
            onSaved={() => { setEditing(false); load(); }}
            onCancel={() => setEditing(false)}
          />
        )}
      </header>

      {source.transcription && !editing && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">{t('sources.transcription')}</h2>
          {/* Line breaks are meaningful in a transcription — they are where the
              lines break on the page — so it keeps its own shape rather than
              reflowing as prose. */}
          <RichText
            text={source.transcription}
            className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 font-mono text-sm text-foreground"
          />
        </section>
      )}

      {source.note && !editing && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">{t('edit.note')}</h2>
          <RichText text={source.note} className="mt-2 text-foreground" />
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">
            {t('sources.citations')} <span className="font-normal text-muted-foreground">({citationTotal})</span>
          </h2>
          <AddCitationToSource sourceId={source.id} onAdded={load} />
        </div>
        {citations.length === 0 && <p className="mt-2 text-muted-foreground">{t('sources.none')}</p>}
        {citations.length > 0 && (
          <>
            <ul className="mt-3 space-y-2">
              {citations.map(c => (
                <li key={c.id} className="border-b pb-2">
                  {c.personId
                    ? <Link to={link(`/person/${c.personId}`)} className="text-primary underline-offset-2 hover:underline">{c.label}</Link>
                    : <span>{c.label}</span>}
                  {c.page && <span className="ml-2 text-sm text-muted-foreground">{t('sources.page')}: {c.page}</span>}
                  {c.quality != null && <span className="ml-2 text-sm text-muted-foreground">{t('person.quality')} {c.quality}</span>}
                  <RichText text={c.text} className="mt-1 text-sm text-muted-foreground" />
                  <RemoveCitationButton id={c.id} onRemoved={load} />
                </li>
              ))}
            </ul>
            {citationTotal > citations.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('sources.truncated').replace('{n}', String(citations.length))}
              </p>
            )}
          </>
        )}
      </section>
    </article>
  );
}
