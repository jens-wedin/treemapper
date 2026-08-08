import { useCallback, useState } from 'react';

/** A checkbox in the chart toolbar that outlives the page it was ticked on. */
function useStoredToggle(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? fallback : stored === '1';
    } catch {
      return fallback;
    }
  });
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* a preference is a nicety — ignore storage failures */
    }
  }, [key]);
  return [on, set];
}

/** "Visa flaggor" — one setting shared by every chart view, remembered. */
export const useFlagPreference = () => useStoredToggle('wedin-tree-visa-flaggor', true);

/**
 * "Visa konsekvenser" — off until asked for. It costs a scan of the whole
 * database, and most sittings at the tree are not about fixing data.
 */
export const useIssueMarkPreference = () => useStoredToggle('wedin-tree-visa-konsekvenser', false);
