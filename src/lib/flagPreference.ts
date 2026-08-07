import { useCallback, useState } from 'react';

const KEY = 'wedin-tree-visa-flaggor';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';   // on by default
  } catch {
    return true;
  }
}

/** "Visa flaggor" — one setting shared by every chart view, remembered. */
export function useFlagPreference(): [boolean, (next: boolean) => void] {
  const [showFlags, setShowFlags] = useState(read);
  const set = useCallback((next: boolean) => {
    setShowFlags(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* a preference is a nicety — ignore storage failures */
    }
  }, []);
  return [showFlags, set];
}
