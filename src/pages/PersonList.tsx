import { useEffect } from 'react';
import { t } from '../lib/i18n';

export default function PersonList() {
  useEffect(() => { document.title = `${t('nav.persons')} – ${t('appTitle')}`; }, []);
  return <p>{t('common.loading')}</p>;
}
