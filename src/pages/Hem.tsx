import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '../lib/i18n';
import { fetchJson } from '../lib/api';

interface Stats { persons: number; families: number; sources: number; media: number; mediaDone: number }

export default function Hem() {
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t('appTitle');
    fetchJson<Stats>('/api/stats').then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <section>
      <h1 className="text-3xl font-bold">{t('appTitle')}</h1>
      <form
        className="mt-6 flex max-w-xl gap-2"
        onSubmit={e => { e.preventDefault(); navigate(`/personer?q=${encodeURIComponent(q)}`); }}
      >
        <div className="flex-1">
          <label htmlFor="hem-sok" className="block text-sm font-medium">{t('home.searchLabel')}</label>
          <Input id="hem-sok" value={q} onChange={e => setQ(e.target.value)} className="mt-1" />
        </div>
        <Button type="submit" className="self-end">{t('search.button')}</Button>
      </form>
      {stats && (
        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              [t('stats.persons'), stats.persons],
              [t('stats.families'), stats.families],
              [t('stats.sources'), stats.sources],
              [t('stats.photos'), `${stats.mediaDone}/${stats.media}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <dt className="text-sm text-gray-600">{label}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
