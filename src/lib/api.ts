import { DEFAULT_TREE, forgetTree, getActiveTree } from './activeTree';

/**
 * Every call says which tree it is about — including the original one, which
 * used to be left implicit for the sake of tidier URLs. Now that it has a real
 * id rather than the word "default", saying it is the honest thing: the export
 * link reads `?tree=wedin`, and what you downloaded is not a guess.
 *
 * A query parameter rather than a header because `<img src>` and the export
 * link never pass through fetch and so cannot set one.
 */
export function apiUrl(path: string): string {
  const tree = getActiveTree();
  if (!tree || tree === DEFAULT_TREE) return path;
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
