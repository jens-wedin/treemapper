import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the person using the app has asked their system for less movement.
 *
 * The chart CSS already honours this through a media query; the view
 * transitions cannot, because their timing lives in JavaScript. Subscribing
 * rather than reading once means turning the setting on takes effect without a
 * reload, the same way `theme.ts` follows the colour scheme.
 */
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
};

const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, get, () => false);
}
