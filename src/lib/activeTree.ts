import { useSyncExternalStore } from 'react';

/**
 * Which of the family trees this browser is looking at.
 *
 * The trees are separate databases that share nothing, so this is not a filter
 * — it decides which data exists at all. It lives in the browser rather than on
 * the server so that a reload, a second tab and the e2e suite each keep their
 * own answer; the id rides along on every request as `?tree=`.
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
const STORAGE_KEY = 'wedin-tree-trad';

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_TREE;
  } catch {
    return DEFAULT_TREE;
  }
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

export function setActiveTree(id: string) {
  if (id === current) return;
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* a preference is a nicety — ignore storage failures */
  }
  notify();
}

/**
 * The stored tree is gone: deleted here, or never present in this checkout.
 * Falling back is better than showing an app where every page 404s.
 */
export function forgetTree() {
  setActiveTree(DEFAULT_TREE);
}

export async function refreshTrees(): Promise<TreeSummary[]> {
  const res = await fetch('/api/trees');
  if (!res.ok) return trees;
  const body = (await res.json()) as { trees: TreeSummary[] };
  trees = body.trees;
  if (!trees.some(tree => tree.id === current)) forgetTree();
  notify();
  return trees;
}

export const useActiveTree = () => useSyncExternalStore(subscribe, getActiveTree, getActiveTree);
export const useTrees = () => useSyncExternalStore(subscribe, getTrees, getTrees);
