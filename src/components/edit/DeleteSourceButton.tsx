import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { t } from '../../lib/i18n';
import { mutateJson } from '../../lib/api';
import { useTreeUrl } from '../../lib/treeUrl';

/**
 * Removing a source, with what it costs said out loud.
 *
 * A citation is the evidence a record rests on. Deleting a cited source leaves
 * people asserting things with the reason quietly gone, so the count goes in
 * the confirmation rather than in a warning nobody reads afterwards — and the
 * server refuses outright unless the request says the citations may go too.
 */
export default function DeleteSourceButton({ id, title, citationCount }: {
  id: string;
  title: string;
  citationCount: number;
}) {
  const navigate = useNavigate();
  const link = useTreeUrl();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      await mutateJson(`/api/sources/${id}?citations=remove`, 'DELETE');
      void navigate(link('/kallor'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Trash2 aria-hidden className="mr-2 h-4 w-4" />
          {t('sources.delete')}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sources.deleteConfirm').replace('{title}', title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {citationCount > 0
                ? t('sources.deleteCited').replace('{n}', String(citationCount))
                : t('sources.deleteAlone')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('edit.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t('sources.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </>
  );
}
