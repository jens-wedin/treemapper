import { describe, it, expect, afterEach } from 'vitest';
import type { PersonIssueMark } from '../../lib/issues';
import { groupProblems } from './issueMarks';
import { setLanguage } from './i18n';

afterEach(() => setLanguage('en'));

describe('groupProblems', () => {
  const mark: PersonIssueMark = {
    severity: 'error',
    problems: [
      {
        severity: 'error',
        code: 'child-born-after-parent-died',
        params: { child: 'Brita', childBirth: 1834, role: 'father', parent: 'Per', parentDeath: 1830 },
      },
      {
        severity: 'error',
        code: 'child-born-after-parent-died',
        params: { child: 'Per', childBirth: 1840, role: 'father', parent: 'Per', parentDeath: 1830 },
      },
      { severity: 'warning', code: 'death-without-date', params: { name: 'Anna' } },
    ],
  };

  it('gathers one heading per kind, worst first', () => {
    expect(groupProblems(mark)).toEqual([
      {
        severity: 'error',
        code: 'child-born-after-parent-died',
        title: 'Child born after a parent died',
        texts: [
          'Brita was born in 1834, after their father Per died in 1830.',
          'Per was born in 1840, after their father Per died in 1830.',
        ],
      },
      {
        severity: 'warning',
        code: 'death-without-date',
        title: 'Death without a date',
        texts: ['Death event without a date for Anna.'],
      },
    ]);
  });

  it('reads in the chosen language, headings and wordings alike', () => {
    setLanguage('sv');
    const [first] = groupProblems(mark);
    expect(first!.title).toBe('Barn fött efter förälders bortgång');
    expect(first!.texts[0]).toBe('Brita föddes 1834, efter att sin far Per dött 1830.');
  });

  it('translates the parent role rather than printing the key', () => {
    setLanguage('de');
    const [first] = groupProblems(mark);
    expect(first!.texts[0]).toContain('Vater');
    expect(first!.texts[0]).not.toContain('father');
  });
});
