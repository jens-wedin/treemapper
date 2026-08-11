import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import { useTreeUrl } from '../../lib/treeUrl';

/**
 * A source you hold yourself — a document, a photograph of a parish register,
 * a notarial act — rather than one that arrived with an import.
 *
 * Only the title is asked for. Everything else, the transcription above all,
 * has room on the source's own page, and a dialog is the wrong shape for a
 * page of handwriting; this one exists to get you there.
 */
export default function NewSourceDialog({ onCreated }: { onCreated?: () => void }) {
  const navigate = useNavigate();
  const link = useTreeUrl();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await mutateJson<{ id: string }>('/api/sources', 'POST', { title });
      setOpen(false);
      setTitle('');
      onCreated?.();
      // Straight to the new source, where the transcription field is.
      void navigate(link(`/kalla/${res.data.id}`));
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
          <FilePlus2 aria-hidden className="mr-2 h-4 w-4" />
          {t('sources.new')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sources.new')}</DialogTitle>
          <DialogDescription>{t('sources.newHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <label htmlFor="ny-kalla-titel" className="block text-sm font-medium">{t('person.name')}</label>
          <Input
            id="ny-kalla-titel"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="mt-1"
            required
            autoFocus
          />
          {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={saving || !title.trim()}>{t('edit.save')}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('edit.cancel')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
