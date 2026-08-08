import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import type { MarriageView } from '../../../lib/queries';
import { formatGedcomDate, t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import EventForm from './EventForm';

/**
 * The wedding, edited where it belongs — on the couple.
 *
 * A marriage is not one spouse's event: GEDCOM records it on the family, which
 * is what makes it appear on both people's pages and export as `FAM.MARR`. That
 * is why it is not in the list of types when adding an event to a person.
 */
export default function MarriageEditor({ familyId, marriage, onChanged }: {
  familyId: string;
  marriage: MarriageView | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!marriage) return;
    try {
      await mutateJson(`/api/events/${marriage.id}`, 'DELETE');
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (editing) {
    return (
      <EventForm
        event={marriage ? { ...marriage, type: 'MARR', age: null, citations: [] } : undefined}
        ownerId={familyId}
        ownerType="family"
        fixedType="MARR"
        onDone={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      {marriage ? (
        <>
          <span className="text-muted-foreground">
            {t('person.marriage')}: {formatGedcomDate(marriage.dateRaw) || marriage.dateYear || '—'}
            {marriage.place && `, ${marriage.place}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{t('edit.edit')}</Button>
          <AlertDialog>
            <AlertDialogTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('edit.remove')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('edit.confirmRemoveMarriageTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('edit.confirmRemove')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('edit.cancel')}</AlertDialogCancel>
                <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={remove}>
                  {t('edit.remove')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{t('edit.addMarriage')}</Button>
      )}
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </div>
  );
}
