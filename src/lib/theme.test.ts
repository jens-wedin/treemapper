import { describe, it, expect } from 'vitest';
import { parseTheme, resolveTheme } from './theme';

/**
 * Only the decision logic is unit-tested here: the project has no DOM test
 * environment, and adding one to assert `classList.contains('dark')` would buy
 * less than the Playwright test that drives the real toggle in a real browser.
 */
describe('parseTheme', () => {
  it('accepts the three modes', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
  });

  it('falls back to system for empty or nonsense', () => {
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('')).toBe('system');
    expect(parseTheme('lila')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the explicit choice whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system when the choice is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
