import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PersonListItem } from '../../lib/queries';
import { t, displayName, lifespan } from '../lib/i18n';
import { fetchJson } from '../lib/api';

/**
 * Search for a person and pick one. Extracted from RelationDialog so the
 * statistics page can scope itself without a second search UI.
 */
export default function PersonSearch({ id, label, picked, onPick }: {
  id: string;
  label: string;
  /** Id of the currently chosen person, so the list can show which one it is. */
  picked?: string | null;
  onPick: (person: PersonListItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PersonListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetchJson<{ items: PersonListItem[] }>(`/api/persons?q=${encodeURIComponent(query)}&limit=10`);
      setHits(res.items);
    } catch {
      setError(t('common.error'));
    }
  }

  return (
    <div>
      <form onSubmit={search}>
        <label htmlFor={id} className="block text-sm font-medium">{label}</label>
        <div className="mt-1 flex gap-2">
          <Input id={id} value={query} onChange={e => setQuery(e.target.value)} />
          <Button type="submit" variant="outline">{t('search.button')}</Button>
        </div>
      </form>
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      {hits && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {hits.length === 0 && <li className="text-muted-foreground">{t('edit.noHits')}</li>}
          {hits.map(h => (
            <li key={h.id}>
              <button
                type="button"
                aria-pressed={picked === h.id}
                className={`underline-offset-2 hover:underline ${picked === h.id ? 'font-semibold' : ''}`}
                onClick={() => onPick(h)}
              >
                {displayName(h)}{' '}
                <span className="text-sm text-muted-foreground">{lifespan(h.birthYear, h.deathYear)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
