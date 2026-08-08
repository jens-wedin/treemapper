import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MediaView } from '../../lib/queries';
import { t } from '../lib/i18n';
import { apiUrl, mutateJson } from '../lib/api';

/**
 * A photo at the size it deserves.
 *
 * The thumbnails are cropped squares, so the picture on the page is not the
 * picture — opening it is the only way to see what was actually photographed.
 * Left and right move between a person's photos, so looking through them does
 * not mean closing and reopening.
 */
export default function PhotoLightbox({ photos, openAt, fallbackAlt, onClose, onRemoved }: {
  photos: MediaView[];
  /** Index to open at, or null when closed. */
  openAt: number | null;
  /** Used when a photo has no title of its own. */
  fallbackAlt: string;
  onClose: () => void;
  /** Removing happens here, where the photo can actually be seen. */
  onRemoved?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (openAt != null) { setIndex(openAt); setError(null); }
  }, [openAt]);

  const open = openAt != null;
  const photo = photos[index];
  const many = photos.length > 1;
  const move = (step: number) => setIndex(i => (i + step + photos.length) % photos.length);

  // Radix handles Escape and the focus trap; the arrows are ours.
  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, many, photos.length]);

  async function remove() {
    if (!photo) return;
    try {
      await mutateJson(`/api/media/${photo.id}`, 'DELETE');
      onClose();
      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      {/* The responsive override matters: DialogContent's own `sm:max-w-lg`
          beats a plain max-w from 640px up, which is every screen this is
          looked at on. */}
      <DialogContent className="sm:max-w-[min(94vw,1100px)]">
        <DialogHeader>
          <DialogTitle>
            {photo.title ?? fallbackAlt}
            {many && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t('person.photoCount').replace('{n}', String(index + 1)).replace('{total}', String(photos.length))}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {many && (
            <Button variant="outline" size="sm" className="shrink-0" aria-label={t('person.photoPrev')} onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
          )}
          {/* min-w-0 is what keeps the arrows inside the dialog: an image's
              own min-width is its intrinsic width, so without this the photo
              refuses to shrink and pushes them out of the box. */}
          <div className="flex min-w-0 flex-1 justify-center">
            <img
              src={apiUrl(`/api/media/${photo.id}`)}
              alt={photo.title ?? fallbackAlt}
              className="max-h-[75vh] max-w-full rounded-md object-contain"
            />
          </div>
          {many && (
            <Button variant="outline" size="sm" className="shrink-0" aria-label={t('person.photoNext')} onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>

        {onRemoved && (
          <div className="flex items-center gap-3">
            <AlertDialog>
              <AlertDialogTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                {t('person.photoRemove')}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('person.photoRemoveTitle').replace('{name}', photo.title ?? fallbackAlt)}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t('person.photoRemoveBody')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('edit.cancel')}</AlertDialogCancel>
                  <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={remove}>
                    {t('person.photoRemove')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
