import { Pencil, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { t, tf } from '../../lib/i18n';

/**
 * The edit and remove pair that sits at the end of an event row.
 *
 * Icons rather than words, so the row reads as the event and not as two
 * buttons — but an icon has no accessible name of its own, and a page with a
 * dozen events would otherwise offer a screen reader a dozen buttons all
 * called "Edit". Each one is therefore named after the event it acts on, and
 * carries the same wording as a `title` for anyone hovering with a mouse.
 *
 * A removal always goes through the app's own dialog rather than
 * `window.confirm`: it follows the theme, reads in all four languages, and can
 * say what disappears.
 */
export default function EventActions({ name, detail, confirmTitle, onEdit, onRemove }: {
  /** What the buttons act on, e.g. "Birth 12 May 1901". Kept short — it is spoken. */
  name: string;
  /** The fuller line for the confirmation, where the place is worth spelling out. */
  detail?: string;
  confirmTitle: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const edit = tf('edit.editNamed', { name });
  const remove = tf('edit.removeNamed', { name });

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground"
        aria-label={edit}
        title={edit}
        onClick={onEdit}
      >
        <Pencil aria-hidden />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={remove}
            title={remove}
          >
            <Trash2 aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{detail ?? name}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">{t('edit.confirmRemove')}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('edit.cancel')}</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onRemove}>
              {t('edit.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
