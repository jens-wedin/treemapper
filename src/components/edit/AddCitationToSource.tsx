import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PersonListItem } from '../../../lib/queries';
import { displayName, t } from '../../lib/i18n';
import PersonSearch from '../PersonSearch';
import CitationForm from './CitationForm';

/**
 * Attaching a source to the people it names, from the source's side.
 *
 * This is the direction you work in when you are holding a document: a
 * notarial act names four men, and you add them one after another without
 * leaving the page you transcribed.
 */
export default function AddCitationToSource({ sourceId, onAdded }: {
  sourceId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<PersonListItem | null>(null);

  function close() {
    setOpen(false);
    setPerson(null);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="mr-2 h-4 w-4" />
        {t('sources.addPerson')}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="max-w-md">
        <PersonSearch
          id="kalla-person"
          label={t('sources.addPerson')}
          picked={person?.id}
          onPick={setPerson}
        />
      </div>
      {person ? (
        <CitationForm
          ownerId={person.id}
          sourceId={sourceId}
          onSaved={() => { close(); onAdded(); }}
          onCancel={close}
        />
      ) : (
        <p className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={close}>{t('edit.cancel')}</Button>
        </p>
      )}
      {person && <p className="mt-2 text-sm text-muted-foreground">{displayName(person)}</p>}
    </div>
  );
}
