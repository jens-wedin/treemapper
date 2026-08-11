import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

/**
 * The fields a citation carries beyond the link itself.
 *
 * `text` is the one that matters: the passage naming this person is what makes
 * a citation worth having. Without it you are left with a pointer at a whole
 * document and no idea which line sent you there.
 *
 * The two ends are chosen by whoever renders this — the person page already
 * knows the person and asks for a source; the source page the other way round.
 */
export default function CitationForm({ ownerId, sourceId, onSaved, onCancel }: {
  ownerId: string;
  sourceId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [page, setPage] = useState('');
  const [quality, setQuality] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await mutateJson('/api/citations', 'POST', {
        ownerType: 'person',
        ownerId,
        sourceId,
        page: page.trim() || null,
        quality: quality === '' ? null : Number(quality),
        text: text.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border p-3">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="cit-sida" className="block text-sm font-medium">{t('sources.page')}</label>
          <Input id="cit-sida" value={page} onChange={e => setPage(e.target.value)} className="mt-1 w-48" />
        </div>
        <div>
          <label htmlFor="cit-kvalitet" className="block text-sm font-medium">{t('sources.quality')}</label>
          {/* GEDCOM QUAY, named rather than numbered: "3" tells you nothing
              about whether that is the good end of the scale. */}
          <select
            id="cit-kvalitet"
            value={quality}
            onChange={e => setQuality(e.target.value)}
            className="mt-1 rounded-md border px-2 py-1"
          >
            <option value="">{t('sources.qualityUnset')}</option>
            <option value="3">3 – {t('sources.quality3')}</option>
            <option value="2">2 – {t('sources.quality2')}</option>
            <option value="1">1 – {t('sources.quality1')}</option>
            <option value="0">0 – {t('sources.quality0')}</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="cit-text" className="block text-sm font-medium">{t('sources.citationText')}</label>
        <Textarea id="cit-text" value={text} onChange={e => setText(e.target.value)} className="mt-1" rows={3} />
        <p className="mt-1 text-sm text-muted-foreground">{t('sources.citationTextHint')}</p>
      </div>
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{t('edit.save')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('edit.cancel')}</Button>
      </div>
    </form>
  );
}
