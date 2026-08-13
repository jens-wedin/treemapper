import { useEffect } from 'react';
import { Link } from 'react-router';
import { t } from '../lib/i18n';
import { apiUrl } from '../lib/api';
import { useTreeId, treeUrl } from '../lib/treeUrl';
import ImportForm from '../components/settings/ImportForm';
import NewTreeForm from '../components/settings/NewTreeForm';
import TreeList from '../components/settings/TreeList';

export default function SettingsPage() {
  const tree = useTreeId();

  useEffect(() => {
    document.title = `${t('export.title')} – ${t('appTitle')}`;
  }, []);

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('export.title')}</h1>

      {/* A maintenance tool rather than a fifth thing in the nav: it empties
          out as the work is done, and fills again only on the next import. */}
      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('countries.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('countries.lead')}</p>
        <Link
          to={treeUrl(tree, '/countries')}
          className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
        >
          {t('countries.title')}
        </Link>
      </section>

      <section id="import" className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('trees.import')}</h2>
        <p className="mt-2 text-foreground">{t('trees.importHelp')}</p>
        <ImportForm />
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('trees.create')}</h2>
        <p className="mt-2 text-foreground">{t('trees.createHelp')}</p>
        <NewTreeForm />
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('trees.list')}</h2>
        <TreeList />
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('export.gedcom')}</h2>
        <p className="mt-2 text-foreground">{t('export.gedcomHelp')}</p>
        {/* A plain link, not fetch(): let the browser handle the download.
            apiUrl() keeps it pointed at the tree currently being shown. */}
        <a
          href={apiUrl('/api/export/gedcom')}
          download
          className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('export.download')}
        </a>
        {/* apiUrl() always carries `?tree=<id>` here: this page only ever
            renders inside a scoped route, which has already adopted a real
            tree id before render, so a plain `&` is safe. */}
        <a
          href={`${apiUrl('/api/export/gedcom')}&container=gdz`}
          download
          className="mt-4 ml-3 inline-block rounded-md border px-4 py-2 font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('export.gedzip')}
        </a>
        <p className="mt-2 text-sm text-muted-foreground">{t('export.gedzipHelp')}</p>
        <p className="mt-4 text-sm text-muted-foreground">{t('export.backupNote')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <code>{t('export.cliNote')}</code>
        </p>
      </section>
    </section>
  );
}
