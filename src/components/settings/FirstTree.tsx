import { t } from '../../lib/i18n';
import ImportForm from './ImportForm';
import NewTreeForm from './NewTreeForm';

/**
 * What you see before there is any family tree at all.
 *
 * A clone of this repository starts with nothing. It used to start with an
 * empty tree named after the author's family, written to disk as a side effect
 * of asking whether it existed — see `lib/trees.ts`.
 *
 * Not a wizard and not a welcome tour: the same two forms Settings has, on
 * their own, because with no tree there is nothing else the app can show. The
 * name given here decides the database's filename, so `Mormors släkt` becomes
 * `trees/mormors-slakt.db`.
 */
export default function FirstTree() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold">{t('firstTree.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('firstTree.lead')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('firstTree.local')}</p>

      <section className="mt-8 rounded-lg border p-4" aria-labelledby="first-import">
        <h2 id="first-import" className="text-lg font-semibold">{t('trees.import')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('firstTree.importLead')}</p>
        <ImportForm />
      </section>

      <section className="mt-6 rounded-lg border p-4" aria-labelledby="first-create">
        <h2 id="first-create" className="text-lg font-semibold">{t('trees.create')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('firstTree.createLead')}</p>
        <NewTreeForm />
      </section>
    </div>
  );
}
