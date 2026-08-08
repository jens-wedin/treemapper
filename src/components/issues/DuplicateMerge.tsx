import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { DuplicateGroup } from '../../../lib/issues';
import type { PersonFull } from '../../../lib/queries';
import { t, displayName } from '../../lib/i18n';
import { fetchJson, mutateJson } from '../../lib/api';
import { clearIssueMarks } from '../../lib/issueMarks';

type Field = 'givenName' | 'surname' | 'marriedName' | 'suffix' | 'sex' | 'note';
const FIELDS: { key: Field; label: string }[] = [
  { key: 'givenName', label: 'edit.firstName' },
  { key: 'surname', label: 'edit.lastName' },
  { key: 'marriedName', label: 'edit.marriedName' },
  { key: 'suffix', label: 'edit.suffix' },
  { key: 'sex', label: 'edit.sex' },
  { key: 'note', label: 'edit.note' },
];

const show = (v: string | null | undefined) => (v == null || v === '' ? '–' : v);

export default function DuplicateMerge({ group, onMerged }: { group: DuplicateGroup; onMerged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<[string, string]>([group.ids[0]!, group.ids[1]!]);
  const [details, setDetails] = useState<Record<string, PersonFull>>({});
  const [survivorId, setSurvivorId] = useState(group.ids[0]!);
  const [choices, setChoices] = useState<Partial<Record<Field, 'survivor' | 'duplicate'>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    Promise.all(pair.map(id => fetchJson<PersonFull>(`/api/persons/${id}/full`)))
      .then(([a, b]) => setDetails({ [pair[0]]: a, [pair[1]]: b }))
      .catch(() => setError(t('common.error')));
  }, [open, pair]);

  const duplicateId = pair.find(id => id !== survivorId)!;
  const a = details[pair[0]];
  const b = details[pair[1]];

  async function merge() {
    setSaving(true);
    setError(null);
    try {
      await mutateJson('/api/merge', 'POST', { survivorId, duplicateId, fieldChoices: choices });
      clearIssueMarks();
      setOpen(false);
      onMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const counts = (p: PersonFull | undefined) => p
    ? `${p.events.length} ${t('issues.events')} · ${p.personCitations.length} ${t('issues.citations')} · ${p.media.length} ${t('issues.photos')}`
    : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{t('issues.merge')}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('issues.mergeTitle')}</DialogTitle>
          <DialogDescription>{group.name} {group.year ?? ''}</DialogDescription>
        </DialogHeader>

        {group.ids.length > 2 && (
          <fieldset className="mt-2">
            <legend className="text-sm font-medium">{t('issues.pickTwo')}</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {group.ids.map(id => (
                <label key={id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pair.includes(id)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...pair.filter(p => p !== id), id].slice(-2)
                        : pair.filter(p => p !== id);
                      if (next.length === 2) {
                        setPair([next[0]!, next[1]!]);
                        setSurvivorId(next[0]!);
                      }
                    }}
                  />
                  {id}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {a && b ? (
          <>
            <table className="mt-4 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-4">{t('issues.field')}</th>
                  {pair.map(id => (
                    <th key={id} scope="col" className="py-2 pr-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="survivor"
                          checked={survivorId === id}
                          onChange={() => { setSurvivorId(id); setChoices({}); }}
                        />
                        <span>
                          {displayName(details[id]!.person)}{' '}
                          <span className="font-normal text-muted-foreground">
                            {id} · {survivorId === id ? t('issues.survivor') : t('issues.duplicate')}
                          </span>
                        </span>
                      </label>
                      <span className="block font-normal text-muted-foreground">{counts(details[id])}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label }) => {
                  const va = a.person[key] ?? '';
                  const vb = b.person[key] ?? '';
                  const differs = String(va) !== String(vb);
                  return (
                    <tr key={key} className="border-b align-top">
                      <th scope="row" className="py-2 pr-4 font-medium">{t(label)}</th>
                      {pair.map(id => {
                        const isSurvivor = id === survivorId;
                        const value = details[id]!.person[key] as string | null;
                        const picked = choices[key] === (isSurvivor ? 'survivor' : 'duplicate')
                          || (!choices[key] && isSurvivor);
                        return (
                          <td key={id} className="py-2 pr-4">
                            {differs ? (
                              <label className="flex items-start gap-2">
                                <input
                                  type="radio"
                                  name={`field-${key}`}
                                  checked={picked}
                                  onChange={() => setChoices(c => ({ ...c, [key]: isSurvivor ? 'survivor' : 'duplicate' }))}
                                />
                                <span className={picked ? 'font-medium' : ''}>{show(value)}</span>
                              </label>
                            ) : (
                              <span className="text-muted-foreground">{show(value)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t('issues.mergeWarning')}
            </p>
          </>
        ) : (
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        )}

        {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={merge} disabled={saving || !a || !b}>
            {t('issues.confirmMerge')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('edit.cancel')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
