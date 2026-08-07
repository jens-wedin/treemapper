import { NavLink, Route, Routes, useLocation } from 'react-router';
import { t } from './lib/i18n';
import Hem from './pages/Hem';
import PersonList from './pages/PersonList';
import PersonPage from './pages/PersonPage';
import TreePage from './pages/TreePage';
import IssuesPage from './pages/IssuesPage';
import SourcesPage from './pages/SourcesPage';
import SourcePage from './pages/SourcePage';
import SettingsPage from './pages/SettingsPage';

/**
 * Page width follows the content: the chart takes the whole window, tables get
 * room for their columns, and prose keeps a readable line length.
 */
function containerClass(pathname: string): string {
  if (pathname.startsWith('/trad')) return 'w-full px-4';
  if (/^\/(personer|kallor|konsekvens)/.test(pathname)) return 'mx-auto w-full max-w-6xl px-4';
  return 'mx-auto w-full max-w-3xl px-4';
}

export default function App() {
  const { pathname } = useLocation();
  const container = containerClass(pathname);
  const isTree = pathname.startsWith('/trad');

  return (
    // The chart page is pinned to the viewport so the SVG can fill it; every
    // other page grows and scrolls normally.
    <div className={`flex flex-col ${isTree ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:shadow"
      >
        {t('nav.skip')}
      </a>
      <header className="border-b">
        <nav aria-label={t('appTitle')} className={`${container} flex items-center gap-6 py-3`}>
          <span className="font-semibold">{t('appTitle')}</span>
          {(
            [
              ['/', t('nav.home')],
              ['/personer', t('nav.persons')],
              ['/trad', t('nav.tree')],
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
        </nav>
      </header>
      <main
        id="innehall"
        className={`${container} flex min-h-0 flex-1 flex-col ${isTree ? 'overflow-auto py-4' : 'py-8'}`}
      >
        <Routes>
          <Route path="/" element={<Hem />} />
          <Route path="/personer" element={<PersonList />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/trad" element={<TreePage />} />
          <Route path="/trad/:id" element={<TreePage />} />
          <Route path="/konsekvens" element={<IssuesPage />} />
          <Route path="/kallor" element={<SourcesPage />} />
          <Route path="/kalla/:id" element={<SourcePage />} />
          <Route path="/installningar" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
