import { DEFAULT_TREE, forgetTree, getActiveTree } from './activeTree';

/**
 * Every call says which tree it is about. The default tree is left implicit so
 * the common case keeps clean URLs; the server reads a missing `tree` the same
 * way. Also used for `<img src>` and the export link, which never pass through
 * fetch and so cannot carry a header — which is why this is a query parameter.
 */
export function apiUrl(path: string): string {
  const tree = getActiveTree();
  if (tree === DEFAULT_TREE) return path;
  return `${path}${path.includes('?') ? '&' : '?'}tree=${encodeURIComponent(tree)}`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody { error?: string; unknownTree?: string }

/**
 * Reading and writing report failure differently, and deliberately so: a page
 * tells "no such record" from "something broke" by the status, while an edit
 * shows the server's own sentence to the person who made it.
 *
 * A tree that no longer exists — deleted in another tab, or a stale id in this
 * browser's storage — drops back to the default tree rather than leaving every
 * page 404ing.
 */
async function failure(res: Response, useServerMessage: boolean): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as ErrorBody | null;
  if (data?.unknownTree) forgetTree();
  const message = (useServerMessage && data?.error) || `HTTP ${res.status}`;
  return new ApiError(message, res.status);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(apiUrl(url));
  if (!res.ok) throw await failure(res, false);
  return res.json() as Promise<T>;
}

/** Mutating request; server error messages (Swedish) surface as Error.message. */
export async function mutateJson<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true; warnings: string[]; data: T }> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await failure(res, true);
  return (await res.json()) as { ok: true; warnings: string[]; data: T };
}
