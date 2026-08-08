import { describe, it, expect } from 'vitest';
import { groupProblems } from './issueMarks';

describe('groupProblems', () => {
  const mark = {
    severity: 'error' as const,
    problems: [
      { severity: 'error' as const, category: 'Barn fött efter förälders bortgång', text: 'Brita föddes 1834.' },
      { severity: 'error' as const, category: 'Barn fött efter förälders bortgång', text: 'Per föddes 1840.' },
      { severity: 'warning' as const, category: 'Dödsfall utan datum', text: 'Inget dödsdatum.' },
    ],
  };

  it('samlar samma kategori under en rubrik, värst först', () => {
    expect(groupProblems(mark)).toEqual([
      {
        severity: 'error',
        category: 'Barn fött efter förälders bortgång',
        texts: ['Brita föddes 1834.', 'Per föddes 1840.'],
      },
      { severity: 'warning', category: 'Dödsfall utan datum', texts: ['Inget dödsdatum.'] },
    ]);
  });

  it('hoppar över tomma formuleringar men behåller kategorin', () => {
    const groups = groupProblems({ severity: 'minor', problems: [{ severity: 'minor', category: 'Småfel', text: '' }] });
    expect(groups).toEqual([{ severity: 'minor', category: 'Småfel', texts: [] }]);
  });
});
