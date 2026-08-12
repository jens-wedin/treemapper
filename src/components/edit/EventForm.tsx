import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DateInput from './DateInput';
import PlaceInput from './PlaceInput';
import type { EventView } from '../../../lib/queries';
import { eventCreateSchema, eventUpdateSchema } from '../../../lib/schemas';
import { t, eventLabel } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

/**
 * Types offered when adding an event to a person.
 *
 * Marriage is deliberately absent: in GEDCOM it belongs to the family, not to
 * either spouse, so it is added from the Familj section instead — which is also
 * what makes it show for both of them and export as `FAM.MARR`.
 */
const TYPES = ['BIRT', 'CHR', 'DEAT', 'BURI', 'RESI', 'OCCU', 'EDUC', 'EMIG', 'IMMI', 'CENS', 'EVEN'];

const emptyToNull = (v: string) => (v.trim() === '' ? null : v.trim());

export default function EventForm({ event, ownerId, ownerType = 'person', fixedType, onDone, onCancel }: {
  event?: EventView;
  ownerId: string;
  /** A family event — a marriage — is owned by the couple. */
  ownerType?: 'person' | 'family';
  /** When set, the type is decided by the caller and not offered as a choice. */
  fixedType?: string;
  onDone: (warnings: string[]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    type: event?.type ?? fixedType ?? 'EVEN',
    dateRaw: event?.dateRaw ?? '',
    place: event?.place ?? '',
    description: event?.description ?? '',
    age: event?.age ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** An impossible date blocks saving, rather than being stored as nothing. */
  const [dateError, setDateError] = useState<string | null>(null);

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
      : eventCreateSchema.safeParse({ ...fields, type: form.type, ownerType, ownerId });
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

  const idp = event ? `e${event.id}` : 'new';

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor={`${idp}-type`} className="block text-sm font-medium">{t('edit.eventType')}</label>
          <select
            id={`${idp}-type`}
            value={form.type}
            disabled={!!event || !!fixedType}
            onChange={e => setForm({ ...form, type: e.target.value })}
            className="mt-1 rounded-md border px-2 py-1.5 disabled:bg-muted"
          >
            {(event && !TYPES.includes(event.type) ? [event.type, ...TYPES] : TYPES).map(ty => (
              <option key={ty} value={ty}>{eventLabel(ty)}</option>
            ))}
          </select>
        </div>
        <PlaceInput id={`${idp}-place`} value={form.place} onChange={place => setForm({ ...form, place })} />
        <div>
          <label htmlFor={`${idp}-description`} className="block text-sm font-medium">{t('edit.description')}</label>
          <Input id={`${idp}-description`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-64" />
        </div>
        {/* Age is the person's age at their own event; a couple has two. */}
        {ownerType === 'person' && (
          <div>
            <label htmlFor={`${idp}-age`} className="block text-sm font-medium">{t('edit.age')}</label>
            <Input id={`${idp}-age`} value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} className="mt-1 w-24" />
          </div>
        )}
      </div>
      <DateInput
        id={`${idp}-date`}
        value={form.dateRaw}
        onChange={dateRaw => setForm({ ...form, dateRaw })}
        onError={setDateError}
      />
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving || !!dateError}>{t('edit.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}
