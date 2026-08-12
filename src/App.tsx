import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router';
import { t, useLanguage, setLanguage, LANGUAGES, type Lang } from './lib/i18n';
import {
  adoptTree, fallbackTree, isKnownTree, notifyTreeChanged, refreshTrees, useActiveTree, useTrees, useTreesLoaded,
} from './lib/activeTree';
import { rescueUrl, treeUrl } from './lib/treeUrl';
import ThemePicker from './components/ThemePicker';
import FirstTree from './components/settings/FirstTree';
import TreePicker from './components/TreePicker';
import Home from './pages/Home';
import PersonList from './pages/PersonList';
import PersonPage from './pages/PersonPage';
import TreePage from './pages/TreePage';
import StatisticsPage from './pages/StatisticsPage';
import CountriesPage from './pages/CountriesPage';
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

/** `/wedin/tree/I500001` → `tree`. The tree is always the first segment. */
const pageOf = (pathname: string): string => pathname.split('/')[2] ?? '';

const containerClass = (pathname: string): string =>
  (pageOf(pathname) === 'tree' ? 'w-full px-4' : PAGE_WIDTH);

/**
 * The pages of one tree. Everything below renders knowing which database it is
 * looking at, because the tree is adopted before any of it runs.
 */
function TreeScope() {
  const { tree } = useParams();
  const { pathname, search, hash } = useLocation();

  // The header renders above these routes and so reads the tree a render
  // early. Catching it up here, after the render that adopted it. Called
  // before any early return, so the hook order never changes.
  const scoped = !!tree && isKnownTree(tree);
  useEffect(() => {
    if (scoped) notifyTreeChanged();
  }, [tree, scoped]);

  // A first segment that is not a tree is an address from before trees were in
  // the path — `/people?q=jens+wedin`. Send it to the tree last open, so old
  // bookmarks land somewhere real instead of on an error.
  if (!scoped) {
    return <Navigate to={`${rescueUrl(fallbackTree(), pathname)}${search}${hash}`} replace />;
  }

  // During render, not in an effect: a page below fetches on mount, and an
  // effect here would run after that fetch had already gone out under the
  // previous tree.
  adoptTree(tree);

  return (
    // Keyed on the tree: switching means every page is showing records that no
    // longer exist, so they are remounted rather than refetched.
    <Routes key={tree}>
      <Route path="/" element={<Home />} />
      <Route path="people" element={<PersonList />} />
      <Route path="person/:id" element={<PersonPage />} />
      <Route path="tree" element={<TreePage />} />
      <Route path="tree/:id" element={<TreePage />} />
      <Route path="statistics" element={<StatisticsPage />} />
      <Route path="countries" element={<CountriesPage />} />
      <Route path="issues" element={<IssuesPage />} />
      <Route path="sources" element={<SourcesPage />} />
      <Route path="source/:id" element={<SourcePage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Routes>
  );
}

/**
 * The header spans the window on every page. Sizing it like the content would
 * make it the thing that jumps on the one page whose content is wider.
 */
const HEADER_WIDTH = 'w-full px-4';

export default function App() {
  const { pathname } = useLocation();
  const container = containerClass(pathname);
  const isTree = pageOf(pathname) === 'tree';
  // Subscribing here re-renders the whole app when the language changes.
  const lang = useLanguage();
  const activeTree = useActiveTree();
  const trees = useTrees();
  const treesLoaded = useTreesLoaded();
  // Told apart on purpose: a list that has not arrived yet is a blank moment,
  // a list that arrived empty is a clone of this repository with no family
  // tree in it. The nav would only offer addresses that cannot resolve.
  const noTrees = treesLoaded && trees.length === 0;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    void refreshTrees();
  }, []);

  return (
    // The chart page is pinned to the viewport so the SVG can fill it; every
    // other page grows and scrolls normally.
    <div className={`flex flex-col ${isTree ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:p-2 focus:shadow"
      >
        {t('nav.skip')}
      </a>
      <header className="border-b">
        <nav aria-label={t('appTitle')} className={`${HEADER_WIDTH} flex items-center gap-6 py-3`}>
          <span className="shrink-0 whitespace-nowrap font-semibold">{t('appTitle')}</span>
          {!noTrees && (
            [
              ['/', t('nav.home')],
              ['/people', t('nav.persons')],
              ['/tree', t('nav.tree')],
              ['/statistics', t('nav.statistics')],
              ['/issues', t('nav.issues')],
              ['/sources', t('nav.sources')],
              ['/settings', t('nav.settings')],
            ] as const
          ).map(([to, label]) => (
            <NavLink
              key={to}
              to={treeUrl(activeTree, to)}
              end={to === '/'}
              className={({ isActive }) =>
                `underline-offset-4 hover:underline ${isActive ? 'font-semibold underline' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
          <div className="ml-auto">
            {!noTrees && <TreePicker />}
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
        id="content"
        className={`${container} flex min-h-0 flex-1 flex-col ${isTree ? 'overflow-auto py-4' : 'py-8'}`}
      >
        {/* Which tree an address names can only be answered against the list of
            trees, so nothing routes until it has arrived. */}
        {noTrees && <FirstTree />}
        {treesLoaded && !noTrees && (
          <Routes>
            <Route path=":tree/*" element={<TreeScope />} />
            <Route path="*" element={<TreeScope />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
