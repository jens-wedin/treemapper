/**
 * Working out a place's country from the places that already name one.
 *
 * The tree contains its own answer key. Of the 11 315 places in `wedin.db`,
 * 7 871 name a country and most pair it with a parish: `Bjuråker, Sverige`
 * appears 173 times. So a bare `Bjuråker` elsewhere in the same file is a
 * lookup in what the family recorded, not a guess against an outside list —
 * which matters, because this is a local-first app holding data about living
 * people and nothing here may reach the network.
 *
 * Learning is per tree. `andersson.db` knows `Vörå` is Finnish and
 * `wedin.db` does not; sharing an index would leak one family's places into
 * another's inferences, the same reason GEDCOM xrefs are per-file.
 */
import { countryFromPlace } from './places';

export type Tier = 'segment' | 'token' | 'fuzzy';

export interface Evidence {
  code: string;
  tier: Tier;
  /** The learned name behind the answer, normalised: `bjuråker`. */
  by: string;
  /** How many country-bearing places taught that name. */
  weight: number;
  /** The country that came second, when one did. */
  rival?: { code: string; weight: number };
  /** Fuzzy only: the word in the place that matched `by`. */
  matched?: string;
}

export interface LearnedIndex {
  /** name → country → how often the pair was seen. */
  names: Map<string, Map<string, number>>;
  /** The names long enough to risk an edit-distance match. */
  fuzzyPool: string[];
}

/**
 * Words that appear in place strings and say nothing about a country.
 *
 * Swedish, and it stays Swedish: this is register vocabulary, which is data.
 * `holm`, `bruk` and `by` are deliberately absent — `Holm` is a parish taught
 * 119 times, and dropping it would lose every place that names it.
 */
const NOISE = new Set([
  'från', 'till', 'och', 'i', 'vid', 'no', 'nr', 'sid', 'sn', 'fs', 'lfs', 'kfdb',
  'socken', 'sockn', 'län', 'l', 'kyrka', 'kyrkan', 'kyrkogård', 'kyrkogården',
  'församling', 'förs', 'änka', 'änkling', 'gift', 'född', 'död', 'census', 'okänd',
]);

const norm = (text: string) =>
  text.toLowerCase().replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();

const segmentsOf = (place: string) => place.split(',').map(s => s.trim()).filter(Boolean);

const wordsOf = (place: string) => place
  .split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean)
  .filter(word => !/^\d+$/.test(word))
  .filter(word => !NOISE.has(word.toLowerCase()));

/** Below this, one edit is a different place rather than a misspelling. */
const MIN_FUZZY_LENGTH = 6;
const MAX_EDITS = 2;

/**
 * How much more evidence the winner needs than the runner-up.
 *
 * Two, measured: it resolves all six names in `wedin.db` that taught more than
 * one country — `värmland` is Sweden 217 times against Norway once — and left
 * no tie at the segment tier. Three against two is a disagreement, not a
 * majority, and is refused.
 */
const MARGIN = 2;

export function learn(places: (string | null | undefined)[]): LearnedIndex {
  const names = new Map<string, Map<string, number>>();

  for (const place of places) {
    if (!place) continue;
    const code = countryFromPlace(place);
    if (!code) continue;
    // Every segment except the country's own, which would only teach itself.
    // Gathered into a set first: one place teaches a name once however often it
    // repeats, so weight reads as "how many places taught this" rather than
    // counting a one-word segment twice for being both a segment and a word.
    const taught = new Set<string>();
    for (const segment of segmentsOf(place).slice(0, -1)) {
      taught.add(norm(segment));
      for (const word of wordsOf(segment)) taught.add(norm(word));
    }

    for (const name of taught) {
      if (!name || NOISE.has(name)) continue;
      if (!names.has(name)) names.set(name, new Map());
      const counts = names.get(name)!;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return {
    names,
    fuzzyPool: [...names.keys()].filter(name => name.length >= MIN_FUZZY_LENGTH),
  };
}

/** The country a set of names points to, or null when they disagree. */
function tally(names: string[], index: LearnedIndex) {
  const votes = new Map<string, { weight: number; by: string; best: number }>();

  for (const name of names) {
    const counts = index.names.get(norm(name));
    if (!counts) continue;
    for (const [code, weight] of counts) {
      const current = votes.get(code);
      if (!current) { votes.set(code, { weight, by: norm(name), best: weight }); continue; }
      current.weight += weight;
      // Report the strongest single name, which is what a reviewer is shown.
      if (weight > current.best) { current.best = weight; current.by = norm(name); }
    }
  }

  const ranked = [...votes].sort((a, b) => b[1].weight - a[1].weight);
  if (!ranked.length) return null;

  const [code, winner] = ranked[0]!;
  const runnerUp = ranked[1];
  if (runnerUp && winner.weight < runnerUp[1].weight * MARGIN) return null;

  return {
    code,
    by: winner.by,
    weight: winner.weight,
    ...(runnerUp ? { rival: { code: runnerUp[0], weight: runnerUp[1].weight } } : {}),
  };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_EDITS) return MAX_EDITS + 1;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/**
 * The country this place points to, with the evidence behind it.
 *
 * Three tiers, tried in order, first answer wins. `fuzzy` is last and is the
 * one that must not be trusted: reading all 125 of its matches against the real
 * database found seven wrong countries, including Belgium placed in Norway and
 * a South African place in Sweden. It is kept because 226 rows are worth
 * having, and quarantined because those seven are invisible in a total.
 *
 * There is deliberately no rule rejecting a string for not "looking like a
 * place". The obvious one — anything over six words is prose — is the same
 * guesswork as the "a single word in the date column means a place" heuristic
 * that was written and then deleted from `lib/dateCleanup.ts`, for filing
 * `INFANT` as a place. A person reading the string rejects it instead.
 */
export function inferCountry(place: string | null | undefined, index: LearnedIndex): Evidence | null {
  if (!place?.trim()) return null;

  const bySegment = tally(segmentsOf(place), index);
  if (bySegment) return { ...bySegment, tier: 'segment' };

  const words = wordsOf(place);
  const byToken = tally(words, index);
  if (byToken) return { ...byToken, tier: 'token' };

  const near = new Map<string, string>();     // learned name -> the word that reached it
  for (const word of words) {
    if (word.length < MIN_FUZZY_LENGTH) continue;
    const candidate = norm(word);
    for (const learned of index.fuzzyPool) {
      if (levenshtein(candidate, learned) <= MAX_EDITS) { near.set(learned, word); break; }
    }
  }
  const byFuzzy = tally([...near.keys()], index);
  if (byFuzzy) return { ...byFuzzy, tier: 'fuzzy', matched: near.get(byFuzzy.by) };

  return null;
}
