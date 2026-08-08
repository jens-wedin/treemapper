import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '../../lib/i18n';
import { apiUrl } from '../../lib/api';

/**
 * Adds a photo to a person.
 *
 * A hidden file input behind a button rather than a bare `<input type="file">`:
 * the browser's own control cannot be labelled the way the rest of the page is,
 * and this keeps the picker one keyboard-reachable button.
 */
export default function PhotoUpload({ personId, onAdded }: {
  personId: string;
  onAdded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('ownerId', personId);
      // The filename is a better title than nothing, and can be edited later.
      form.append('title', file.name.replace(/\.[^.]+$/, ''));

      const res = await fetch(apiUrl('/api/media'), { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <ImagePlus aria-hidden="true" className="mr-1 size-4" />
        {busy ? t('person.photoUploading') : t('person.photoAdd')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t('person.photoAdd')}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
