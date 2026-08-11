import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { t } from '../../lib/i18n';
import { refreshTrees, type TreeSummary } from '../../lib/activeTree';
import { treeUrl } from '../../lib/treeUrl';

/**
 * A family tree started from nothing.
 *
 * The counterpart to importing: sometimes there is no GEDCOM to begin from,
 * only what someone remembers. Creating it switches to it straight away —
 * there is nothing to look at in the old one that relates to this.
 */
export default function NewTreeForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<TreeSummary | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setMade(body.tree);
      setName('');
      await refreshTrees();
      // Navigating is what switches tree now that the address decides which
      // one is open; setting the state alone would be undone on the next render.
      void navigate(treeUrl(body.tree.id, '/settings'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor="nytt-trad" className="block text-sm font-medium">{t('trees.createName')}</label>
        <input
          id="nytt-trad"
          value={name}
          onChange={e => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={busy || !name.trim()}>{t('trees.create')}</Button>

      <div aria-live="polite">
        {error && <p className="text-destructive">{error}</p>}
        {made && <p className="text-sm text-muted-foreground">{t('trees.createdEmpty').replace('{name}', made.name)}</p>}
      </div>
    </form>
  );
}
