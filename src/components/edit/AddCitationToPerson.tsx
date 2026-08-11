import { useEffect, useState } from 'react';
import { BookPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '../../lib/i18n';
import { fetchJson } from '../../lib/api';
import CitationForm from './CitationForm';

interface SourceHit { id: string; title: string | null; author: string | null }

/**
 * Attaching a source to a person, from the person's side.
 *
 * The direction you work in while researching someone: you have just found the
 * parish record and want it on their page. The source is searched for by name
 * rather than picked from a list — there are 520 of them.
 */
export default function AddCitationToPerson({ personId, onAdded }: {
  personId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SourceHit[] | null>(null);
  const [source, setSource] = useState<SourceHit | null>(null);

  useEffect(() => {
    if (!open || source) return;
    const term = query.trim();
    if (term.length < 2) { setHits(null); return; }
    let stale = false;
    const timer = setTimeout(() => {
      fetchJson<{ items: SourceHit[] }>(`/api/sources?limit=8&q=${encodeURIComponent(term)}`)
        .then(r => { if (!stale) setHits(r.items); })
        .catch(() => { if (!stale) setHits([]); });
    }, 200);
    return () => { stale = true; clearTimeout(timer); };
  }, [query, open, source]);

  function close() {
    setOpen(false);
    setQuery('');
    setHits(null);
    setSource(null);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookPlus aria-hidden className="mr-2 h-4 w-4" />
        {t('sources.addSource')}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <label htmlFor="person-source" className="block text-sm font-medium">{t('sources.search')}</label>
      <Input
        id="person-source"
        value={source ? (source.title ?? source.id) : query}
        onChange={e => { setSource(null); setQuery(e.target.value); }}
        className="mt-1 max-w-md"
        autoFocus
      />
      {!source && hits && (
        <ul className="mt-2 space-y-1 text-sm">
          {hits.length === 0 && <li className="text-muted-foreground">{t('edit.noHits')}</li>}
          {hits.map(h => (
            <li key={h.id}>
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => { setSource(h); setHits(null); }}
              >
                {h.title ?? h.id}
              </button>
              {h.author && <span className="text-muted-foreground"> · {h.author}</span>}
            </li>
          ))}
        </ul>
      )}
      {source ? (
        <CitationForm
          ownerId={personId}
          sourceId={source.id}
          onSaved={() => { close(); onAdded(); }}
          onCancel={close}
        />
      ) : (
        <p className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={close}>{t('edit.cancel')}</Button>
        </p>
      )}
    </div>
  );
}
