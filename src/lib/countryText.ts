import { t, tf, countryLabel } from './i18n';
import type { Tier } from '../../lib/countryEvidence';

/**
 * A country proposal, in the reader's language.
 *
 * The server sends a code, a piece of evidence and some numbers; the wording is
 * built here, because word order differs across the four languages and the
 * server has no idea which one is on screen.
 *
 * Note which country name goes where. `countryLabel()` gives the reader's
 * language and is what these sentences use. The name actually *written into*
 * the place text comes from `countryName()` on the server and is always
 * Swedish, because a place name is data rather than interface. So an English
 * reader approving "Sweden" writes `Sverige`, and that is correct.
 */

const TIER_LABEL: Record<Tier, string> = {
  segment: 'countries.tierSegment',
  token: 'countries.tierToken',
  fuzzy: 'countries.tierFuzzy',
};

export function tierLabel(tier: Tier): string {
  return t(TIER_LABEL[tier]);
}

/**
 * The evidence name as a reader expects to see it: `Bjuråker`, not `bjuråker`.
 *
 * Only the first letter, never every word. `Västernorrlands län` is correct
 * Swedish and `Västernorrlands Län` is not, so title-casing would introduce an
 * error into the one thing on the line the reader is meant to judge.
 */
function asName(by: string): string {
  return by.charAt(0).toUpperCase() + by.slice(1);
}

/** `Bjuråker → Sweden`. */
export function evidenceLine(by: string, code: string): string {
  return tf('countries.evidence', { by: asName(by), country: countryLabel(code) });
}

/** `79 places · 296 events`. */
export function coverage(places: number, rows: number): string {
  return tf('countries.covers', { places, rows });
}

/**
 * How much the tree agrees, and what it disagreed with.
 *
 * The rival is shown rather than hidden: a name taught 217 times against once
 * is a different proposition from one taught three times against two, and the
 * reader is the one who should weigh it.
 */
export function strength(weight: number, rival?: { code: string; weight: number }): string {
  const taught = tf('countries.taught', { weight });
  if (!rival) return taught;
  return `${taught}, ${tf('countries.rivalled', { country: countryLabel(rival.code), weight: rival.weight })}`;
}

/** `Härnösands ≈ härnösand` — the near-miss, spelled out so a wrong one shows. */
export function nearMiss(matched: string | undefined, by: string): string {
  return tf('countries.matchedWord', { word: matched ?? '', name: by });
}
