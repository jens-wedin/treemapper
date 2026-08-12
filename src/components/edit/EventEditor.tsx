import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CitationView, EventView } from '../../../lib/queries';
import { t, eventLabel, eventDescription, formatGedcomDate } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import EventActions from './EventActions';
import EventForm from './EventForm';

export default function EventEditor({ events, ownerId, title, citations: Citations, onChanged }: {
  events: EventView[];
  ownerId: string;
  /** The section heading, rendered here so the add button can share its line. */
  title: string;
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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <CalendarPlus aria-hidden className="mr-2 h-4 w-4" />
          {t('edit.addEvent')}
        </Button>
      </div>
      {warnings.length > 0 && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">{warnings.join(' ')}</p>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {adding && <EventForm ownerId={ownerId} onDone={done} onCancel={() => setAdding(false)} />}
      <ol className="mt-3 space-y-4 border-l pl-4">
        {events.map(e => {
          const date = e.dateRaw ? formatGedcomDate(e.dateRaw) : '';
          const name = [eventLabel(e.type), date].filter(Boolean).join(' ');
          return (
            <li key={e.id}>
              {editingId === e.id ? (
                <EventForm event={e} ownerId={ownerId} onDone={done} onCancel={() => setEditingId(null)} />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">
                      {eventLabel(e.type)}
                      {date && <span className="ml-2 font-normal text-muted-foreground">{date}</span>}
                      {e.age && <span className="ml-2 text-sm font-normal text-muted-foreground">({t('person.age')} {e.age})</span>}
                    </div>
                    <EventActions
                      name={name}
                      detail={e.place ? `${name}, ${e.place}` : name}
                      confirmTitle={t('edit.confirmRemoveTitle')}
                      onEdit={() => setEditingId(e.id)}
                      onRemove={() => remove(e.id)}
                    />
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
          );
        })}
      </ol>
    </>
  );
}
