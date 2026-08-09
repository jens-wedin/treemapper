import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { FamilyView, PersonFull } from '../../../lib/queries';
import { t, displayName } from '../../lib/i18n';
import RelationForm, { RELATION_LABEL, type RelationType } from './RelationForm';

/**
 * The person page's way in: a button that opens the relation form in its own
 * dialog. The chart uses RelationForm directly, inside the dialog its card's
 * plus already opened.
 */
export default function RelationDialog({ type, person, families, onSaved }: {
  type: RelationType;
  person: PersonFull['person'];
  families: FamilyView[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{t(RELATION_LABEL[type])}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(RELATION_LABEL[type])}</DialogTitle>
          <DialogDescription>{displayName(person)}</DialogDescription>
        </DialogHeader>
        <RelationForm
          type={type}
          person={person}
          families={families}
          onSaved={() => { setOpen(false); onSaved(); }}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
