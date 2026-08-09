import { useSyncExternalStore } from 'react';

/**
 * A checkbox in the chart toolbar that outlives the page it was ticked on.
 * Module-level rather than component state: the chart owns the checkbox but
 * the person panel reads the same setting, and both must move together.
 */
function createToggle(key: string, fallback: boolean) {
  const listeners = new Set<() => void>();
  let value = read();

  function read(): boolean {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? fallback : stored === '1';
    } catch {
      return fallback;   // storage unavailable — the default still works
    }
  }

  const get = () => value;
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  };

  function set(next: boolean): void {
    if (next === value) return;
    value = next;
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* a preference is a nicety — ignore storage failures */
    }
    listeners.forEach(notify => notify());
  }

  return (): [boolean, (next: boolean) => void] => [useSyncExternalStore(subscribe, get, get), set];
}

/** "Visa flaggor" — one setting shared by every chart view, remembered. */
export const useFlagPreference = createToggle('wedin-tree-visa-flaggor', true);

/**
 * "Visa konsekvenser" — off until asked for. It costs a scan of the whole
 * database, and most sittings at the tree are not about fixing data.
 */
export const useIssueMarkPreference = createToggle('wedin-tree-visa-konsekvenser', false);

/**
 * "Lägg till släkting" — an editing affordance on every card, off by default.
 * Browsing the tree is the common case, and a plus on each card is noise until
 * the sitting is about filling gaps in.
 */
export const useAddRelativePreference = createToggle('wedin-tree-lagg-till-slakting', false);
