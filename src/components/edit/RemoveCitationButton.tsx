import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';

/**
 * Unties one source from one person. The document stays where it is — this
 * removes the claim that it says something about them, not the document.
 */
export default function RemoveCitationButton({ id, onRemoved }: { id: number; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-auto px-1 py-0 text-sm text-muted-foreground hover:text-destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await mutateJson(`/api/citations/${id}`, 'DELETE');
            onRemoved();
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('sources.removeCitation')}
      </Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </>
  );
}
