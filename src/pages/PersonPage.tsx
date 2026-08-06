import { useEffect } from 'react';
import { t } from '../lib/i18n';

export default function PersonPage() {
  useEffect(() => { document.title = t('appTitle'); }, []);
  return <p>{t('common.loading')}</p>;
}
