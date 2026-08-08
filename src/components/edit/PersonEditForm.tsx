import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PersonFull } from '../../../lib/queries';
import { personUpdateSchema } from '../../../lib/schemas';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

type Person = PersonFull['person'];

const emptyToNull = (v: string) => (v.trim() === '' ? null : v.trim());

export default function PersonEditForm({ person, onSaved, onCancel }: {
  person: Person;
  onSaved: (warnings: string[]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    givenName: person.givenName ?? '',
    surname: person.surname ?? '',
    marriedName: person.marriedName ?? '',
    suffix: person.suffix ?? '',
    sex: person.sex,
    note: person.note ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = personUpdateSchema.safeParse({
      givenName: form.givenName.trim(),
      surname: form.surname.trim(),
      marriedName: emptyToNull(form.marriedName),
      suffix: emptyToNull(form.suffix),
      sex: form.sex,
      note: emptyToNull(form.note),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ogiltiga fält');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await mutateJson(`/api/persons/${person.id}`, 'PATCH', parsed.data);
      onSaved(res.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const field = (id: string, label: string, key: 'givenName' | 'surname' | 'marriedName' | 'suffix', width = 'w-56') => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <Input id={id} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={`mt-1 ${width}`} />
    </div>
  );

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        {field('red-fornamn', t('edit.firstName'), 'givenName')}
        {field('red-efternamn', t('edit.lastName'), 'surname')}
        {field('red-giftasnamn', t('edit.marriedName'), 'marriedName')}
        {field('red-suffix', t('edit.suffix'), 'suffix', 'w-28')}
        <div>
          <label htmlFor="red-kon" className="block text-sm font-medium">{t('edit.sex')}</label>
          <select
            id="red-kon"
            value={form.sex}
            onChange={e => setForm({ ...form, sex: e.target.value as Person['sex'] })}
            className="mt-1 rounded-md border px-2 py-1.5"
          >
            <option value="M">{t('edit.sexM')}</option>
            <option value="F">{t('edit.sexF')}</option>
            <option value="U">{t('edit.sexU')}</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="red-anteckning" className="block text-sm font-medium">{t('edit.note')}</label>
        <Textarea id="red-anteckning" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="mt-1" rows={4} />
      </div>
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>{t('edit.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}
