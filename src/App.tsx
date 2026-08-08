import { useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router';
import { t, useLanguage, setLanguage, LANGUAGES, type Lang } from './lib/i18n';
import { useActiveTree } from './lib/activeTree';
import ThemePicker from './components/ThemePicker';
import TreePicker from './components/TreePicker';
import Hem from './pages/Hem';
import PersonList from './pages/PersonList';
import PersonPage from './pages/PersonPage';
import TreePage from './pages/TreePage';
import StatisticsPage from './pages/StatisticsPage';
import IssuesPage from './pages/IssuesPage';
import SourcesPage from './pages/SourcesPage';
import SourcePage from './pages/SourcePage';
import SettingsPage from './pages/SettingsPage';

/**
 * One width for every page, so nothing shifts when you change tab. The chart is
 * the single exception — it is worth the whole window — and it earns it without
 * moving anything above, because the header has its own width and keeps it.
 *
 * The widths used to follow each page's content, which meant the nav itself
 * moved between tabs.
 */
const PAGE_WIDTH = 'mx-auto w-full max-w-6xl px-4';

const containerClass = (pathname: string): string =>
  (pathname.startsWith('/trad') ? 'w-full px-4' : PAGE_WIDTH);

/**
 * The header spans the window on every page. Sizing it like the content would
 * make it the thing that jumps on the one page whose content is wider.
 */
const HEADER_WIDTH = 'w-full px-4';

export default function App() {
  const { pathname } = useLocation();
  const container = containerClass(pathname);
  const isTree = pathname.startsWith('/trad');
  // Subscribing here re-renders the whole app when the language changes.
  const lang = useLanguage();
  const activeTree = useActiveTree();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    // The chart page is pinned to the viewport so the SVG can fill it; every
    // other page grows and scrolls normally.
    <div className={`flex flex-col ${isTree ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:p-2 focus:shadow"
      >
        {t('nav.skip')}
      </a>
      <header className="border-b">
        <nav aria-label={t('appTitle')} className={`${HEADER_WIDTH} flex items-center gap-6 py-3`}>
          <span className="shrink-0 whitespace-nowrap font-semibold">{t('appTitle')}</span>
          {(
            [
              ['/', t('nav.home')],
              ['/personer', t('nav.persons')],
              ['/trad', t('nav.tree')],
              ['/statistik', t('nav.statistics')],
              ['/konsekvens', t('nav.issues')],
              ['/kallor', t('nav.sources')],
              ['/installningar', t('nav.settings')],
            ] as const
          ).map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `underline-offset-4 hover:underline ${isActive ? 'font-semibold underline' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
          <div className="ml-auto">
            <TreePicker />
          </div>
          <ThemePicker />
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t('language')}</span>
            <select
              aria-label={t('language')}
              value={lang}
              onChange={e => setLanguage(e.target.value as Lang)}
              className="rounded-md border px-2 py-1"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </nav>
      </header>
      <main
        id="innehall"
        className={`${container} flex min-h-0 flex-1 flex-col ${isTree ? 'overflow-auto py-4' : 'py-8'}`}
      >
        {/* Keyed on the tree: switching means every page is showing records
            that no longer exist, so they are remounted rather than refetched. */}
        <Routes key={activeTree}>
          <Route path="/" element={<Hem />} />
          <Route path="/personer" element={<PersonList />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/trad" element={<TreePage />} />
          <Route path="/trad/:id" element={<TreePage />} />
          <Route path="/statistik" element={<StatisticsPage />} />
          <Route path="/konsekvens" element={<IssuesPage />} />
          <Route path="/kallor" element={<SourcesPage />} />
          <Route path="/kalla/:id" element={<SourcePage />} />
          <Route path="/installningar" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
