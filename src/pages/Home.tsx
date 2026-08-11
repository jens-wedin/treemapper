import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t , uiLocale } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { useTreeUrl } from '../lib/treeUrl';

interface Stats { persons: number; families: number; sources: number; media: number; mediaDone: number }
interface IssueSummary { total: number; totalAll: number; dismissed: number }

export default function Home() {
  const link = useTreeUrl();
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [issues, setIssues] = useState<IssueSummary | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t('appTitle');
    fetchJson<Stats>('/api/stats').then(setStats).catch(() => setStats(null));
    // limit=0: only the totals are needed, for the scoreboard
    fetchJson<IssueSummary>('/api/issues?limit=0').then(setIssues).catch(() => setIssues(null));
  }, []);

  return (
    <section>
      <h1 className="text-3xl font-bold">{t('appTitle')}</h1>
      <form
        className="mt-6 flex max-w-xl gap-2"
        onSubmit={e => { e.preventDefault(); navigate(link(`/people?q=${encodeURIComponent(q)}`)); }}
      >
        <div className="flex-1">
          <label htmlFor="home-search" className="block text-sm font-medium">{t('home.searchLabel')}</label>
          <Input id="home-search" value={q} onChange={e => setQ(e.target.value)} className="mt-1" />
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
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {issues && (
        <section className="mt-8 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{t('issues.scoreboard')}</h2>
          <p className="mt-1 text-foreground">
            {t('issues.remaining')
              .replace('{n}', issues.total.toLocaleString(uiLocale()))
              .replace('{total}', issues.totalAll.toLocaleString(uiLocale()))}
          </p>
          <Link to={link('/issues')} className="mt-2 inline-block text-primary underline-offset-2 hover:underline">
            {t('issues.title')}
          </Link>
        </section>
      )}
    </section>
  );
}
