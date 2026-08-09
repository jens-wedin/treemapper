import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonFull } from '../../../lib/queries';
import { displayName, t } from '../../lib/i18n';
import { fetchJson } from '../../lib/api';
import RelationForm, { RELATION_LABEL, type RelationType } from './RelationForm';

/**
 * Adding a relative from the chart, without leaving it.
 *
 * The chart only knows a person's name and years; placing a child needs to know
 * which family it belongs to, so the full record is fetched when the dialog
 * opens rather than held for every card on screen.
 *
 * The three forms are the same ones the person page uses — there is one way to
 * add a relative, reached from two places.
 */
export default function AddRelativeDialog({ personId, onClose, onSaved }: {
  /** The person to add a relative to, or null when closed. */
  personId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<PersonFull | null>(null);
  const [error, setError] = useState(false);
  /** Which kind of relative, once chosen. */
  const [type, setType] = useState<RelationType | null>(null);

  useEffect(() => {
    if (!personId) return;
    let stale = false;
    setData(null);
    setError(false);
    setType(null);
    fetchJson<PersonFull>(`/api/persons/${personId}/full`)
      .then(d => { if (!stale) setData(d); })
      .catch(() => { if (!stale) setError(true); });
    return () => { stale = true; };
  }, [personId]);

  return (
    <Dialog open={personId != null} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {data ? t('tree.addRelativeTo').replace('{name}', displayName(data.person)) : t('common.loading')}
          </DialogTitle>
        </DialogHeader>

        {error && <p role="alert" className="text-destructive">{t('common.error')}</p>}
        {!data && !error && <Skeleton className="h-10 w-full" />}

        {/* One dialog, two steps: which kind of relative, then the form. A
            second dialog nested in this one cannot open. */}
        {data && !type && (
          <div className="flex flex-wrap gap-2">
            {(['child', 'spouse', 'parent'] as const).map(choice => (
              <Button key={choice} variant="outline" size="sm" onClick={() => setType(choice)}>
                {t(RELATION_LABEL[choice])}
              </Button>
            ))}
          </div>
        )}

        {data && type && (
          <RelationForm
            type={type}
            person={data.person}
            families={data.families}
            onSaved={() => { onClose(); onSaved(); }}
            onCancel={() => setType(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
