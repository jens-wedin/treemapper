import { describe, it, expect, afterEach } from 'vitest';
import { ISSUE_CODES } from '../../lib/issues';
import { DICTIONARIES } from './i18n/dictionaries';
import { LANGUAGES, setLanguage } from './i18n';
import { issueText, issueTitle } from './issueText';

afterEach(() => setLanguage('en'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]!).sort();

describe('issue strings', () => {
  it('gives every code a title and a wording in every language', () => {
    for (const { code: lang } of LANGUAGES) {
      const dict = DICTIONARIES[lang] as Record<string, Record<string, string>>;
      const missingTitles = ISSUE_CODES.filter(c => !dict.issueTitle?.[c]);
      const missingTexts = ISSUE_CODES.filter(c => !dict.issueText?.[c]);
      expect({ lang, missingTitles, missingTexts }).toEqual({ lang, missingTitles: [], missingTexts: [] });
    }
  });

  it('carries no wording for a code that no longer exists', () => {
    const known = new Set<string>(ISSUE_CODES);
    for (const { code: lang } of LANGUAGES) {
      const dict = DICTIONARIES[lang] as Record<string, Record<string, string>>;
      const extra = Object.keys(dict.issueText ?? {}).filter(c => !known.has(c));
      expect({ lang, extra }).toEqual({ lang, extra: [] });
    }
  });

  it('fills every placeholder a translation asks for', () => {
    // Languages need different constructions — Swedish wants a possessive
    // where English wants a preposition — so the templates are not required to
    // use the *same* placeholders. What matters is that each one it does use
    // gets filled: a stray {name} renders a sentence about nobody, and nothing
    // else in the codebase would notice.
    const english = DICTIONARIES.en as Record<string, Record<string, string>>;
    for (const code of ISSUE_CODES) {
      // `role` also yields `roleOwner`, which resolve() derives from it.
      const supplied = new Set(placeholders(english.issueText![code]!));
      if (supplied.has('role')) supplied.add('roleOwner');
      for (const { code: lang } of LANGUAGES) {
        const dict = DICTIONARIES[lang] as Record<string, Record<string, string>>;
        const unfillable = placeholders(dict.issueText![code]!).filter(p => !supplied.has(p));
        expect({ code, lang, unfillable }).toEqual({ code, lang, unfillable: [] });
      }
    }
  });

  it('gives the possessive role a word in every language', () => {
    for (const { code: lang } of LANGUAGES) {
      const dict = DICTIONARIES[lang] as Record<string, Record<string, string>>;
      expect({ lang, father: !!dict.issueRoleOwner?.father, mother: !!dict.issueRoleOwner?.mother })
        .toEqual({ lang, father: true, mother: true });
    }
  });
});

describe('issueText', () => {
  it('fills the values the detector reported', () => {
    expect(issueText('died-too-old', { name: 'Anna Wedin', birth: 1801, death: 1930, age: 129 }))
      .toBe('Anna Wedin (born 1801, died 1930) was 129 years old at death.');
  });

  it('translates the event tag rather than printing it', () => {
    expect(issueText('fact-after-death', { event: 'RESI', name: 'Anna', date: 'ABT 1860', year: 1850 }))
      .toBe('Residence for Anna (ABT 1860) happened after the year of death, 1850.');
  });

  it('translates the duplicate confidence', () => {
    expect(issueText('possible-duplicate', { year: 1880, others: 1, confidence: 'high' }))
      .toContain('high (same parents)');
    expect(issueText('possible-duplicate', { year: 1880, others: 1, confidence: 'review' }))
      .toContain('needs judgement');
  });

  it('reads "as 1 more" and "as 3 more" alike, so no count needs a plural', () => {
    expect(issueText('possible-duplicate', { year: 1880, others: 1, confidence: 'high' }))
      .toContain('as 1 more in the tree');
    expect(issueText('possible-duplicate', { year: 1880, others: 3, confidence: 'high' }))
      .toContain('as 3 more in the tree');
  });

  it('follows the chosen language', () => {
    setLanguage('sv');
    expect(issueTitle('missing-birth')).toBe('Saknar födelse');
    expect(issueText('missing-birth', { name: 'Anna' })).toBe('Ingen födelsehändelse registrerad för Anna.');
  });
});

describe('the possessive role', () => {
  it('reads as Swedish grammar wants it, not as a translated preposition', () => {
    const params = { child: 'Maria', childBirth: 1836, role: 'father', parent: 'Abraham', parentDeath: 1800 };
    setLanguage('sv');
    expect(issueText('child-born-after-parent-died', params))
      .toBe('Maria föddes 1836, efter faderns Abraham död 1800.');
    setLanguage('en');
    expect(issueText('child-born-after-parent-died', params))
      .toBe('Maria was born in 1836, after their father Abraham died in 1800.');
  });
});
