import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './useReducedMotion';

/**
 * Keeps a value around for a moment after it goes away, so whatever it renders
 * can animate out before it disappears.
 *
 * Without this a panel can only ever animate *in*: the moment its id becomes
 * null React unmounts it, and there is nothing left to slide away. The value is
 * held rather than a boolean flag because the leaving panel still has to draw
 * the person it was showing.
 *
 * Under reduced motion nothing lingers — going away is immediate.
 */
export function useLingering<T>(value: T | null, ms: number): { value: T | null; leaving: boolean } {
  const reduced = usePrefersReducedMotion();
  const [held, setHeld] = useState<T | null>(value);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (value !== null) {
      setHeld(value);
      setLeaving(false);
      return;
    }
    if (held === null) return;
    if (reduced) {
      setHeld(null);
      return;
    }
    setLeaving(true);
    timer.current = setTimeout(() => {
      setHeld(null);
      setLeaving(false);
    }, ms);
    return () => clearTimeout(timer.current);
  }, [value, ms, reduced, held]);

  return { value: held, leaving };
}
