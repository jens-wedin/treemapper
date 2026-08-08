import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { t, useLanguage } from '../../lib/i18n';
import { refreshTrees, useActiveTree, useTrees, type TreeSummary } from '../../lib/activeTree';

const when = (iso: string, lang: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.valueOf()) ? iso : at.toLocaleDateString(lang, { dateStyle: 'medium' });
};

function Row({ tree, onChanged }: { tree: TreeSummary; onChanged: () => void }) {
  const lang = useLanguage();
  const active = useActiveTree();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(tree.name);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    onChanged();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex items-center gap-2">
            {/* Its own label, not "Namn på släktträdet": the import form above
                uses that one, and two fields with the same accessible name are
                indistinguishable to a screen reader. */}
            <label htmlFor={`name-${tree.id}`} className="sr-only">
              {t('trees.renameLabel').replace('{name}', tree.name)}
            </label>
            <input
              id={`name-${tree.id}`}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full max-w-64 rounded-md border px-2 py-1 text-sm"
            />
            <Button
              size="sm"
              onClick={async () => {
                await send(`/api/trees/${tree.id}`, 'PATCH', { name });
                setRenaming(false);
              }}
            >
              {t('trees.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setName(tree.name); setRenaming(false); }}>
              {t('trees.cancel')}
            </Button>
          </div>
        ) : (
          <p className="font-medium">
            {tree.name}
            {tree.id === active && <span className="ml-2 text-sm text-muted-foreground">({t('trees.label')})</span>}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t('trees.persons').replace('{n}', String(tree.persons))} · {t('trees.created').replace('{date}', when(tree.createdAt, lang))}
        </p>
        {/* Photos are links in a GEDCOM, not files: a fresh tree has none. */}
        {tree.photosPending > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('trees.photosPending').replace('{n}', String(tree.photosPending))}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {!renaming && (
        <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>{t('trees.rename')}</Button>
      )}

      {tree.isDefault ? (
        <span className="text-sm text-muted-foreground">{t('trees.deleteDefault')}</span>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('trees.delete')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('trees.deleteTitle').replace('{name}', tree.name)}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('trees.deleteBody').replace('{n}', String(tree.persons))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('trees.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                onClick={() => void send(`/api/trees/${tree.id}`, 'DELETE')}
              >
                {t('trees.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}

/** Every tree in the app, the original one first. */
export default function TreeList() {
  const trees = useTrees();

  useEffect(() => {
    void refreshTrees();
  }, []);

  return (
    <ul className="mt-4">
      {trees.map(tree => (
        <Row key={tree.id} tree={tree} onChanged={() => void refreshTrees()} />
      ))}
    </ul>
  );
}
