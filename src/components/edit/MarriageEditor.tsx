import { useState } from 'react';
import { HeartPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MarriageView } from '../../../lib/queries';
import { formatGedcomDate, t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import EventActions from './EventActions';
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

  const date = marriage ? formatGedcomDate(marriage.dateRaw) || marriage.dateYear || '' : '';
  const name = [t('person.marriage'), date].filter(Boolean).join(' ');

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      {marriage ? (
        <>
          <span className="text-muted-foreground">
            {t('person.marriage')}: {date || '—'}
            {marriage.place && `, ${marriage.place}`}
          </span>
          <EventActions
            name={name}
            detail={marriage.place ? `${name}, ${marriage.place}` : name}
            confirmTitle={t('edit.confirmRemoveMarriageTitle')}
            onEdit={() => setEditing(true)}
            onRemove={remove}
          />
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <HeartPlus aria-hidden className="mr-2 h-4 w-4" />
          {t('edit.addMarriage')}
        </Button>
      )}
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </div>
  );
}
