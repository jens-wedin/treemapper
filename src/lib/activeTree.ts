import { useSyncExternalStore } from 'react';
import { readPreference, writePreference } from './storage';

/**
 * Which of the family trees this browser is looking at.
 *
 * The trees are separate databases that share nothing, so this is not a filter
 * — it decides which data exists at all.
 *
 * The address decides it. What is stored here is a copy, kept so that
 * `apiUrl()` can reach it from outside React, and so a bare `/` can return you
 * to the tree you had open last. It is never the authority: when the two
 * disagree the URL wins, which is what makes a link mean one thing.
 */

export interface TreeSummary {
  id: string;
  name: string;
  createdAt: string;
  sourceFile: string | null;
  isDefault: boolean;
  persons: number;
  /** Photos the GEDCOM names but that have never been downloaded. */
  photosPending: number;
}

export const DEFAULT_TREE = 'default';
const STORAGE_KEY = 'wedin-tree-active-tree';
const LEGACY_KEY = 'wedin-tree-trad';

function read(): string {
  return readPreference(STORAGE_KEY, LEGACY_KEY) || DEFAULT_TREE;
}

let current = typeof window === 'undefined' ? DEFAULT_TREE : read();
let trees: TreeSummary[] = [];

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const getActiveTree = () => current;
export const getTrees = () => trees;

function remember(id: string) {
  current = id;
  writePreference(STORAGE_KEY, id);
}

export function setActiveTree(id: string) {
  if (id === current) return;
  remember(id);
  notify();
}

/**
 * Take the tree from the address, during render and before any page below has
 * rendered or fetched.
 *
 * It has to be synchronous. Done in an effect, a page's own fetch effect can
 * run first and ask the previous tree for a record only the new one has — the
 * request goes out under the wrong database and 404s.
 *
 * Deliberately does not notify: the navigation that changed the URL is already
 * re-rendering everything below, and notifying mid-render would be a setState
 * during another component's render.
 */
export function adoptTree(id: string) {
  if (id !== current) remember(id);
}

/**
 * Tell the rest of the app the tree changed, once the render that adopted it
 * is over.
 *
 * The header renders before the routes below it do, so it reads the tree one
 * render before `adoptTree` has set it — the picker went on showing the tree
 * you had just left. This is called from an effect, where notifying is safe.
 */
export const notifyTreeChanged = () => notify();

/** The tree to open when the address does not say — the last one used. */
export const rememberedTree = () => current;

/** The tree to fall back to: whichever one the server marks as the original. */
export const defaultTreeId = () => trees.find(tree => tree.isDefault)?.id ?? DEFAULT_TREE;

/**
 * The stored tree is gone: deleted here, or never present in this checkout.
 * Falling back is better than showing an app where every page 404s.
 */
export function forgetTree() {
  setActiveTree(defaultTreeId());
}

export async function refreshTrees(): Promise<TreeSummary[]> {
  const res = await fetch('/api/trees');
  if (!res.ok) return trees;
  const body = (await res.json()) as { trees: TreeSummary[] };
  trees = body.trees;
  // `default` is the legacy alias, so a browser that stored it before trees
  // had ids is pointing at a real tree — just not by the name it now has.
  if (current === DEFAULT_TREE) remember(defaultTreeId());
  if (!trees.some(tree => tree.id === current)) forgetTree();
  notify();
  return trees;
}

/** Whether a path segment names a tree — the router's test for `/personer` vs `/wedin`. */
export const isKnownTree = (id: string) => trees.some(tree => tree.id === id);

/**
 * A tree that certainly exists, for an address that names one that does not.
 * The remembered tree is the friendlier answer but can itself be the tree just
 * deleted, which is exactly when this gets asked.
 */
export const fallbackTree = () => (isKnownTree(current) ? current : defaultTreeId());

export const useActiveTree = () => useSyncExternalStore(subscribe, getActiveTree, getActiveTree);
export const useTrees = () => useSyncExternalStore(subscribe, getTrees, getTrees);
