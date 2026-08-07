import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { FamilyView, PersonFull } from '../../../lib/queries';
import { relationSchema } from '../../../lib/schemas';
import { t, displayName } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import PersonSearch from '../PersonSearch';

type RelationType = 'child' | 'spouse' | 'parent';
const LABEL: Record<RelationType, string> = {
  child: 'edit.addChild', spouse: 'edit.addSpouse', parent: 'edit.addParent',
};

export default function RelationDialog({ type, person, families, onSaved }: {
  type: RelationType;
  person: PersonFull['person'];
  families: FamilyView[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [picked, setPicked] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState({ givenName: '', surname: '', sex: 'U' as 'M' | 'F' | 'U' });
  const [familyId, setFamilyId] = useState<string>(families[0]?.familyId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only 'child' is ambiguous when the person has several families.
  const needsFamilyChoice = type === 'child' && families.length > 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      type,
      personId: person.id,
      ...(mode === 'existing' ? { relativeId: picked ?? undefined } : { newPerson }),
      ...(needsFamilyChoice && familyId ? { familyId } : {}),
    };
    const parsed = relationSchema.safeParse(input);
    if (!parsed.success) {
      setError(mode === 'existing' ? t('edit.searchFirst') : parsed.error.issues[0]?.message ?? 'Ogiltiga fält');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutateJson('/api/relations', 'POST', parsed.data);
      setOpen(false);
      setPicked(null);
      setNewPerson({ givenName: '', surname: '', sex: 'U' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{t(LABEL[type])}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(LABEL[type])}</DialogTitle>
          <DialogDescription>{displayName(person)}</DialogDescription>
        </DialogHeader>

        <fieldset className="mt-2">
          <legend className="sr-only">{t('edit.pickExisting')} / {t('edit.createNew')}</legend>
          <div className="flex gap-4">
            {([['existing', t('edit.pickExisting')], ['new', t('edit.createNew')]] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`rel-mode-${type}`}
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'existing' ? (
          <div className="mt-4">
            <PersonSearch
              id={`rel-sok-${type}`}
              label={t('search.name')}
              picked={picked}
              onPick={h => setPicked(h.id)}
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <div>
              <label htmlFor={`rel-fornamn-${type}`} className="block text-sm font-medium">{t('edit.firstName')}</label>
              <Input id={`rel-fornamn-${type}`} value={newPerson.givenName} onChange={e => setNewPerson({ ...newPerson, givenName: e.target.value })} className="mt-1 w-48" />
            </div>
            <div>
              <label htmlFor={`rel-efternamn-${type}`} className="block text-sm font-medium">{t('edit.lastName')}</label>
              <Input id={`rel-efternamn-${type}`} value={newPerson.surname} onChange={e => setNewPerson({ ...newPerson, surname: e.target.value })} className="mt-1 w-48" />
            </div>
            <div>
              <label htmlFor={`rel-kon-${type}`} className="block text-sm font-medium">{t('edit.sex')}</label>
              <select
                id={`rel-kon-${type}`}
                value={newPerson.sex}
                onChange={e => setNewPerson({ ...newPerson, sex: e.target.value as 'M' | 'F' | 'U' })}
                className="mt-1 rounded-md border px-2 py-1.5"
              >
                <option value="M">{t('edit.sexM')}</option>
                <option value="F">{t('edit.sexF')}</option>
                <option value="U">{t('edit.sexU')}</option>
              </select>
            </div>
          </div>
        )}

        {needsFamilyChoice && (
          <div className="mt-4">
            <label htmlFor={`rel-familj-${type}`} className="block text-sm font-medium">{t('edit.family')}</label>
            <select
              id={`rel-familj-${type}`}
              value={familyId}
              onChange={e => setFamilyId(e.target.value)}
              className="mt-1 rounded-md border px-2 py-1.5"
            >
              {families.map(f => (
                <option key={f.familyId} value={f.familyId}>
                  {f.spouse ? displayName(f.spouse) : f.familyId}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={submit} disabled={saving}>{t('edit.save')}</Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('edit.cancel')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
