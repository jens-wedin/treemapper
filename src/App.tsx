import { NavLink, Route, Routes } from 'react-router';
import { t } from './lib/i18n';
import Hem from './pages/Hem';
import PersonList from './pages/PersonList';
import PersonPage from './pages/PersonPage';
import TreePage from './pages/TreePage';

export default function App() {
  return (
    <>
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:shadow"
      >
        {t('nav.skip')}
      </a>
      <header className="border-b">
        <nav aria-label={t('appTitle')} className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">{t('appTitle')}</span>
          {(
            [
              ['/', t('nav.home')],
              ['/personer', t('nav.persons')],
              ['/trad', t('nav.tree')],
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
      <main id="innehall" className="mx-auto max-w-3xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Hem />} />
          <Route path="/personer" element={<PersonList />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/trad" element={<TreePage />} />
          <Route path="/trad/:id" element={<TreePage />} />
        </Routes>
      </main>
    </>
  );
}
