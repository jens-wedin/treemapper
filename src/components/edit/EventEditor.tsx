import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import type { CitationView, EventView } from '../../../lib/queries';
import { t, eventLabel, eventDescription, formatGedcomDate } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import EventForm from './EventForm';

export default function EventEditor({ events, ownerId, citations: Citations, onChanged }: {
  events: EventView[];
  ownerId: string;
  citations: (props: { items: CitationView[] }) => React.ReactNode;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function done(w: string[]) {
    setWarnings(w);
    setEditingId(null);
    setAdding(false);
    onChanged();
  }

  async function remove(id: number) {
    try {
      await mutateJson(`/api/events/${id}`, 'DELETE');
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <>
      {warnings.length > 0 && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">{warnings.join(' ')}</p>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      <ol className="mt-3 space-y-4 border-l pl-4">
        {events.map(e => (
          <li key={e.id}>
            {editingId === e.id ? (
              <EventForm event={e} ownerId={ownerId} onDone={done} onCancel={() => setEditingId(null)} />
            ) : (
              <>
                <div className="font-medium">
                  {eventLabel(e.type)}
                  {e.dateRaw && <span className="ml-2 font-normal text-muted-foreground">{formatGedcomDate(e.dateRaw)}</span>}
                  {e.age && <span className="ml-2 text-sm font-normal text-muted-foreground">({t('person.age')} {e.age})</span>}
                  <span className="ml-3 inline-flex gap-1 align-middle">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(e.id)}>
                      {t('edit.edit')}
                    </Button>
                    {/* En egen dialog i stället för window.confirm: den
                        följer temat, går att läsa på alla fyra språken och
                        säger vad borttagningen faktiskt innebär. */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">{t('edit.remove')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('edit.confirmRemoveTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {eventLabel(e.type)}
                            {e.dateRaw ? ` ${formatGedcomDate(e.dateRaw)}` : ''}
                            {e.place ? `, ${e.place}` : ''}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <p className="text-sm text-muted-foreground">{t('edit.confirmRemove')}</p>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('edit.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            className={buttonVariants({ variant: 'destructive' })}
                            onClick={() => remove(e.id)}
                          >
                            {t('edit.remove')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </span>
                </div>
                {(e.place || eventDescription(e.description)) && (
                  <div className="text-foreground">
                    {[eventDescription(e.description), e.place].filter(Boolean).join(' — ')}
                  </div>
                )}
                <Citations items={e.citations} />
              </>
            )}
          </li>
        ))}
      </ol>
      {adding ? (
        <EventForm ownerId={ownerId} onDone={done} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" className="mt-3" onClick={() => setAdding(true)}>
          {t('edit.addEvent')}
        </Button>
      )}
    </>
  );
}
