import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { plural, t } from '../../lib/i18n';
import { refreshTrees, type TreeSummary } from '../../lib/activeTree';
import { treeUrl } from '../../lib/treeUrl';

interface ImportSummary {
  inserted: { persons: number; families: number; sources: number; media: number };
  warnings: string[];
}

/**
 * Reads a GEDCOM file into a brand new tree.
 *
 * Deliberately a plain form with a plain file input: it has to work for someone
 * who has never opened a terminal, and a labelled `<input type="file">` is the
 * control every browser, screen reader and keyboard already understands.
 */
export default function ImportForm({ onImported }: { onImported?: (tree: TreeSummary) => void }) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tree: TreeSummary; summary: ImportSummary } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name);
      const res = await fetch('/api/trees/import', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setResult(body);
      setName('');
      if (fileRef.current) fileRef.current.value = '';
      await refreshTrees();
      onImported?.(body.tree);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor="gedcom-file" className="block text-sm font-medium">{t('trees.file')}</label>
        <input
          id="gedcom-file"
          ref={fileRef}
          type="file"
          accept=".ged,.GED,.gdz,.GDZ"
          required
          // Naming the tree after the file is right often enough to be a good
          // default, and it is still editable.
          onChange={e => {
            const chosen = e.target.files?.[0];
            if (chosen && !name) setName(chosen.name.replace(/\.(ged|gdz)$/i, ''));
          }}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground"
        />
      </div>

      <div>
        <label htmlFor="gedcom-name" className="block text-sm font-medium">{t('trees.name')}</label>
        <input
          id="gedcom-name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={busy}>{busy ? t('trees.importing') : t('trees.submit')}</Button>

      <div aria-live="polite" className="space-y-2">
        {error && <p className="text-destructive">{error}</p>}
        {result && (
          <>
            <p className="font-medium">
              {result.tree.name}: {[
                plural(result.summary.inserted.persons, 'trees.unitPerson', 'trees.unitPersons'),
                plural(result.summary.inserted.families, 'trees.unitFamily', 'trees.unitFamilies'),
                plural(result.summary.inserted.sources, 'trees.unitSource', 'trees.unitSources'),
              ].join(', ')}
            </p>
            <Button type="button" variant="secondary" onClick={() => void navigate(treeUrl(result.tree.id, '/'))}>
              {t('trees.open').replace('{name}', result.tree.name)}
            </Button>
            {result.summary.warnings.length ? (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {t('trees.warnings').replace('{n}', String(result.summary.warnings.length))}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.summary.warnings.slice(0, 50).map((warning, i) => <li key={i}>{warning}</li>)}
                </ul>
              </details>
            ) : (
              <p className="text-sm text-muted-foreground">{t('trees.noWarnings')}</p>
            )}
          </>
        )}
      </div>
    </form>
  );
}
