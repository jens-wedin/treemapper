import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EventView } from '../../../lib/queries';
import { eventCreateSchema, eventUpdateSchema } from '../../../lib/schemas';
import { t, eventLabel } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

// Types offered when adding an event — the common person events, Swedish-labelled.
const TYPES = ['BIRT', 'CHR', 'DEAT', 'BURI', 'RESI', 'OCCU', 'EDUC', 'EMIG', 'IMMI', 'CENS', 'EVEN'];

const emptyToNull = (v: string) => (v.trim() === '' ? null : v.trim());

export default function EventForm({ event, ownerId, onDone, onCancel }: {
  event?: EventView;
  ownerId: string;
  onDone: (warnings: string[]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    type: event?.type ?? 'EVEN',
    dateRaw: event?.dateRaw ?? '',
    place: event?.place ?? '',
    description: event?.description ?? '',
    age: event?.age ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      dateRaw: emptyToNull(form.dateRaw),
      place: emptyToNull(form.place),
      description: emptyToNull(form.description),
      age: emptyToNull(form.age),
    };
    const parsed = event
      ? eventUpdateSchema.safeParse(fields)
      : eventCreateSchema.safeParse({ ...fields, type: form.type, ownerType: 'person', ownerId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ogiltiga fält');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = event
        ? await mutateJson(`/api/events/${event.id}`, 'PATCH', parsed.data)
        : await mutateJson('/api/events', 'POST', parsed.data);
      onDone(res.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const idp = event ? `h${event.id}` : 'ny';

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor={`${idp}-typ`} className="block text-sm font-medium">{t('edit.eventType')}</label>
          <select
            id={`${idp}-typ`}
            value={form.type}
            disabled={!!event}
            onChange={e => setForm({ ...form, type: e.target.value })}
            className="mt-1 rounded-md border px-2 py-1.5 disabled:bg-muted"
          >
            {(event && !TYPES.includes(event.type) ? [event.type, ...TYPES] : TYPES).map(ty => (
              <option key={ty} value={ty}>{eventLabel(ty)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idp}-datum`} className="block text-sm font-medium">{t('edit.date')}</label>
          <Input id={`${idp}-datum`} value={form.dateRaw} onChange={e => setForm({ ...form, dateRaw: e.target.value })} className="mt-1 w-56" />
        </div>
        <div>
          <label htmlFor={`${idp}-plats`} className="block text-sm font-medium">{t('edit.place')}</label>
          <Input id={`${idp}-plats`} value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} className="mt-1 w-64" />
        </div>
        <div>
          <label htmlFor={`${idp}-beskrivning`} className="block text-sm font-medium">{t('edit.description')}</label>
          <Input id={`${idp}-beskrivning`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-64" />
        </div>
        <div>
          <label htmlFor={`${idp}-alder`} className="block text-sm font-medium">{t('edit.age')}</label>
          <Input id={`${idp}-alder`} value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} className="mt-1 w-24" />
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>{t('edit.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}
