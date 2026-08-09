import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { newPersonSchema } from '../../../lib/schemas';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

/**
 * A person who is nobody's relative yet.
 *
 * Everyone else is added from an existing person's page, as their child,
 * partner or parent. A tree with nobody in it has no such page, so this is the
 * only way in — and the way to add someone whose connection is not known yet.
 */
export default function NewPersonDialog({ onCreated }: { onCreated?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ givenName: '', surname: '', sex: 'U' as 'M' | 'F' | 'U' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = newPersonSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ogiltiga fält');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await mutateJson<{ id: string }>('/api/persons', 'POST', parsed.data);
      setOpen(false);
      setForm({ givenName: '', surname: '', sex: 'U' });
      onCreated?.();
      void navigate(`/person/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus aria-hidden="true" className="mr-1 size-4" />
          {t('edit.newPerson')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('edit.newPerson')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="ny-fornamn" className="block text-sm font-medium">{t('edit.firstName')}</label>
            <Input id="ny-fornamn" value={form.givenName} onChange={e => setForm({ ...form, givenName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label htmlFor="ny-efternamn" className="block text-sm font-medium">{t('edit.lastName')}</label>
            <Input id="ny-efternamn" value={form.surname} onChange={e => setForm({ ...form, surname: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label htmlFor="ny-kon" className="block text-sm font-medium">{t('edit.sex')}</label>
            <select
              id="ny-kon"
              value={form.sex}
              onChange={e => setForm({ ...form, sex: e.target.value as 'M' | 'F' | 'U' })}
              className="mt-1 w-full rounded-md border px-2 py-1.5"
            >
              <option value="U">{t('edit.sexU')}</option>
              <option value="M">{t('edit.sexM')}</option>
              <option value="F">{t('edit.sexF')}</option>
            </select>
          </div>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={saving}>{t('edit.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
