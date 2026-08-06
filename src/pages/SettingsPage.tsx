import { useEffect } from 'react';
import { t } from '../lib/i18n';

export default function SettingsPage() {
  useEffect(() => {
    document.title = `${t('export.title')} – ${t('appTitle')}`;
  }, []);

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('export.title')}</h1>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('export.gedcom')}</h2>
        <p className="mt-2 text-gray-700">{t('export.gedcomHelp')}</p>
        {/* A plain link, not fetch(): let the browser handle the download. */}
        <a
          href="/api/export/gedcom"
          download
          className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('export.download')}
        </a>
        <p className="mt-4 text-sm text-gray-600">{t('export.backupNote')}</p>
        <p className="mt-1 text-sm text-gray-500">
          <code>{t('export.cliNote')}</code>
        </p>
      </section>
    </section>
  );
}
