import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { media, persons } from '../db/schema';
import { audit, MutationError } from './mutations';

/**
 * Photos added by hand, rather than downloaded from a GEDCOM's links.
 *
 * An uploaded file is stored the same way a downloaded one is —
 * `media/<row id>.<ext>` — so everything downstream (the media endpoint, the
 * export, a later `npm run media`) treats the two alike. The row is written
 * first because the id is what names the file.
 */

/** What a browser may send. Anything else is a mistake worth naming. */
const FORMS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/tiff': 'tif', 'image/bmp': 'bmp',
};

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export const formOf = (mimeType: string): string | null => FORMS[mimeType.toLowerCase()] ?? null;

export function addPhoto(db: Db, input: {
  ownerId: string;
  title: string | null;
  mimeType: string;
  bytes: Buffer;
}, mediaDir: string): { id: number } {
  const form = formOf(input.mimeType);
  if (!form) throw new MutationError('That file format is not supported — choose an image', 400);
  if (!input.bytes.length) throw new MutationError('That file is empty', 400);
  if (input.bytes.length > MAX_PHOTO_BYTES) throw new MutationError('That image is too large — 25 MB at most', 400);
  if (!db.select().from(persons).where(eq(persons.id, input.ownerId)).all().length) {
    throw new MutationError('That person does not exist', 404);
  }

  const id = db.transaction(tx => {
    const row = {
      ownerType: 'person' as const,
      ownerId: input.ownerId,
      title: input.title,
      // The file's own name, so the GEDCOM export writes a FILE line that
      // points at something real and a re-import can find it again.
      originalUrl: '',
      form,
      filesize: input.bytes.length,
      localPath: '',
      downloadStatus: 'done' as const,
      downloadedAt: new Date().toISOString(),
    };
    const inserted = tx.insert(media).values(row).returning({ id: media.id }).all()[0]!;
    // The folder the file is actually written to, below — not a guess at it.
    // Hardcoding `media/` recorded a path that does not exist for any tree but
    // the first, and that path is what the GEDCOM export writes as its FILE.
    const localPath = path.join(mediaDir, `${inserted.id}.${form}`);
    tx.update(media).set({ localPath, originalUrl: localPath }).where(eq(media.id, inserted.id)).run();
    audit(tx, 'create', 'media', inserted.id, null, { ...row, id: inserted.id, localPath, originalUrl: localPath });
    return inserted.id;
  });

  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, `${id}.${form}`), input.bytes);
  return { id };
}

/**
 * Removes the photo from the person — and deliberately leaves the file on
 * disk. The row is in the audit log and can be put back; the picture itself
 * may be the only copy of a face nobody living remembers.
 */
export function removePhoto(db: Db, id: number): void {
  db.transaction(tx => {
    const before = tx.select().from(media).where(eq(media.id, id)).all()[0];
    if (!before) throw new MutationError('That photo does not exist', 404);
    tx.delete(media).where(eq(media.id, id)).run();
    audit(tx, 'delete', 'media', id, before, null);
  });
}
