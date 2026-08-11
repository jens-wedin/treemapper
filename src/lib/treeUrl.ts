import { useCallback } from 'react';
import { useLocation, useParams } from 'react-router';
import { getActiveTree } from './activeTree';

/**
 * Every address names its tree: `/wedin/people`, `/andersson/person/I500001`.
 *
 * It used to live only in the browser, which made every link ambiguous — the
 * same `/person/I500001` meant a different person depending on what the picker
 * was last set to, so a bookmark quietly rotted and a shared link showed the
 * reader somebody else. The id in the path fixes the answer.
 *
 * The segments are English, like the rest of the project. The Swedish ones
 * (`/personer`, `/kallor`, `/trad`) are gone rather than redirected: they were
 * only ever in this one browser's history.
 */

/**
 * Pages whose first segment could be mistaken for a tree. A tree called
 * "People" would otherwise slug to `people` and make `/people`
 * unanswerable, so `allocateId` refuses these — see lib/trees.ts.
 */
export const PAGE_SEGMENTS = [
  'people', 'person', 'tree', 'statistics', 'issues', 'sources', 'source', 'settings',
] as const;

/** `/wedin` + `/people` → `/wedin/people`. */
export function treeUrl(tree: string, path: string): string {
  const rest = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${tree}${rest}`;
}

/**
 * The tree this page is showing, straight from the path.
 *
 * Falls back to the stored tree only where there is no `:tree` param to read —
 * a component rendered outside the scoped routes.
 */
export function useTreeId(): string {
  return useParams().tree ?? getActiveTree();
}

/** Builds links for the current tree: `link('/people')` → `/wedin/people`. */
export function useTreeUrl(): (path: string) => string {
  const tree = useTreeId();
  return useCallback((path: string) => treeUrl(tree, path), [tree]);
}

/**
 * Where a page about one record goes when there is no record to show: its list.
 * `/person/I500001` has no meaning in another tree, and `/person` on its own
 * matches no route at all — it would render a blank page.
 */
const LANDING: Record<string, string> = { person: 'people', source: 'sources' };

/**
 * The same page in another tree.
 *
 * Record ids are per-tree, so a person or a source cannot survive the move and
 * lands on its list instead. The chart is the exception: it picks its own root
 * when given none. A search carries over — the name you typed still means
 * something in the other tree, which is the whole point of looking.
 */
export function switchTreeUrl(to: string, pathname: string, search: string): string {
  const [, , page = ''] = pathname.split('/');
  const target = LANDING[page] ?? page;
  const keepSearch = target === 'people' && page === 'people' ? search : '';
  return `${treeUrl(to, target ? `/${target}` : '/')}${keepSearch}`;
}

/**
 * Where to send an address whose first segment is not a tree, given a tree that
 * is.
 *
 * Two different things arrive here and they need opposite treatment:
 *
 *   `/people?q=…`           an address from before trees were in the path.
 *                           The tree is *missing* — put one in front.
 *   `/grannslakten/people`   a tree that has been deleted, or never existed
 *                           here. The tree is *wrong* — swap it out. Prefixing
 *                           would give `/wedin/grannslakten/people`, which
 *                           matches no page at all.
 */
export function rescueUrl(tree: string, pathname: string): string {
  const first = pathname.split('/')[1] ?? '';
  const looksLikeAPage = first === '' || (PAGE_SEGMENTS as readonly string[]).includes(first);
  const rest = looksLikeAPage ? pathname : pathname.slice(first.length + 1) || '/';
  return treeUrl(tree, rest);
}

/** The path with its tree stripped: `/wedin/people` → `/people`. */
export function useUnscopedPath(): string {
  const { pathname } = useLocation();
  const tree = useParams().tree;
  if (!tree) return pathname;
  const rest = pathname.slice(`/${tree}`.length);
  return rest || '/';
}
