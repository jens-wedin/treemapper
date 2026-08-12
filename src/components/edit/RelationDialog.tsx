import { useState } from 'react';
import { Baby, Heart, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { FamilyView, PersonFull } from '../../../lib/queries';
import { t, displayName } from '../../lib/i18n';
import RelationForm, { RELATION_LABEL, type RelationType } from './RelationForm';

/** Decorative — the label says which relative; the icon only makes the trio scannable. */
const RELATION_ICON: Record<RelationType, typeof Baby> = {
  child: Baby, spouse: Heart, parent: UserPlus,
};

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
  const Icon = RELATION_ICON[type];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon aria-hidden className="mr-2 h-4 w-4" />
          {t(RELATION_LABEL[type])}
        </Button>
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
