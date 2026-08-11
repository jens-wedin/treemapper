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
function resolve(params: IssueParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    const translate = TRANSLATED[key];
    out[key] = translate ? translate(String(value)) : value;
  }
  if ('role' in params) out.roleOwner = t(`issueRoleOwner.${params.role}`);
  return out;
}

/** The heading: what kind of problem this is. */
export const issueTitle = (code: IssueCode): string => t(`issueTitle.${code}`);

/** The problem in words, with the names, years and counts filled in. */
export const issueText = (code: IssueCode, params: IssueParams): string =>
  tf(`issueText.${code}`, resolve(params));
