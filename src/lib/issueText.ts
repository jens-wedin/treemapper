import { t, tf, eventLabel } from './i18n';
import type { IssueCode, IssueParams } from '../../lib/issues';

/**
 * A detected problem, in the reader's language.
 *
 * The detector reports a code and the values behind it; the sentence is built
 * here. It has to be: word order differs between the four languages, and the
 * server has no idea which one is on screen.
 *
 * Two parameters are keys rather than text. `event` is a GEDCOM tag, and
 * `role` is `father` or `mother` — both are translated before they go into the
 * sentence, so "Birth for Anna" becomes "Födelse för Anna" and not
 * "BIRT för Anna".
 */
const TRANSLATED: Record<string, (value: string) => string> = {
  event: value => eventLabel(value),
  role: value => t(`issueRole.${value}`),
  confidence: value => t(`issueConfidence.${value}`),
};

/**
 * `role` also arrives as `roleOwner`, the possessive.
 *
 * English says "after their father Abraham died"; Swedish wants "efter faderns
 * Abraham död" — a definite form, not a preposition. Rather than force one
 * grammar on four languages, both forms are offered and each template takes
 * the one that fits.
 */
export function resolveParams(params: IssueParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    const translate = TRANSLATED[key];
    out[key] = translate ? translate(String(value)) : value;
  }
  if ('role' in params) out.roleOwner = t(`issueRoleOwner.${params.role}`);
  return out;
}

/**
 * Which parameters name a person, in the order they line up with an issue's
 * `personIds`, so the sentence can link each name to that person's page.
 *
 * Every detector adds its person params in `personIds` order (see `lib/issues`),
 * so `child` is `personIds[0]` and `parent` is `personIds[1]`, and a single
 * `name` is `personIds[0]`. This map is kept beside the templates because it
 * follows their placeholders; a test checks each key is a real placeholder, and
 * `lib/issues.test.ts` checks the order holds. `duplicate-marriage` joins two
 * names into one `couple` value and `possible-duplicate` names nobody, so
 * neither is linkable and neither appears here.
 */
export const PERSON_PARAMS: Partial<Record<IssueCode, readonly string[]>> = {
  'death-before-birth': ['name'],
  'fact-after-death': ['name'],
  'fact-before-birth': ['name'],
  'died-too-old': ['name'],
  'alive-too-old': ['name'],
  'multiple-births': ['name'],
  'multiple-deaths': ['name'],
  'missing-birth': ['name'],
  'birth-without-date': ['name'],
  'death-without-date': ['name'],
  'double-space-in-name': ['name'],
  'odd-capitalisation': ['name'],
  'two-digit-year': ['name'],
  'place-looks-like-date': ['name'],
  'child-older-than-parents': ['child', 'parent'],
  'child-born-after-parent-died': ['child', 'parent'],
  'parents-too-young': ['parent', 'child'],
  'parent-too-old': ['parent', 'child'],
  'siblings-born-too-close': ['a', 'b'],
  'siblings-share-given-name': ['name', 'sibling'],
  'large-spouse-age-gap': ['husband', 'wife'],
  'married-name-as-surname': ['wife', 'husband'],
  'married-too-young': ['name'],
  'died-too-young-to-marry': ['name'],
  'inconsistent-surname-spelling': ['name'],
  'inconsistent-place-spelling': ['name'],
};

/** The heading: what kind of problem this is. */
export const issueTitle = (code: IssueCode): string => t(`issueTitle.${code}`);

/** The problem in words, with the names, years and counts filled in. */
export const issueText = (code: IssueCode, params: IssueParams): string =>
  tf(`issueText.${code}`, resolveParams(params));
