# MEMORY — where the project stands

_Last updated: 2026-08-11. All six spec phases are built, plus tree UX work, a
shadcn theme, Statistics, multiple family trees, the tree in every URL, sources
you can write out and cite by hand, several rounds of data repair — and the
whole project moved to English._

## Countries on places (2026-08-12)

`Settings → Countries` fills in the country of a place that names none, one
approval at a time. **The tree teaches itself**: 7 871 places pair a parish with
a country, so `Bjuråker` is a lookup, not a guess. Nothing reaches the network.

**Finished 2026-08-12. The queue is empty — 0 stated, 0 learned, 0
quarantined.** Places naming a country went from 7 871 to 11 098 of 11 309 —
**98.1%**, up from 70%. 3 241 events updated across two passes, every one
audit-logged; 22 inferences rejected.

What is left is 137 places, 211 rows, and none of it is inferable:

- ~31 are records the export joined (`Hemsö, Västernorrland, Sweden, Hemsö,
  Västernorrland, Sverige`, and one spanning Wyoming and Minnesota). They need
  **splitting**, which is a different job.
- The rest have no evidence at all: `Census`, `Th.`, `Bjr.`, `Email`,
  `Unknown`, `Same Place`, `Loppi`, `Lahti`, `Kiruna`.

`npx tsx scripts/country-report.ts wedin` lists every one with a person link.

Note the audit_log clock runs behind the shell's — filter generously when
checking whether a write landed, or it looks like nothing happened. `npx tsx scripts/country-report.ts wedin` prints all
of it without opening the app.

Things worth not rediscovering:

- **Edit distance is the untrustworthy tier and stays quarantined.** Reading all
  125 of its matches found seven wrong countries — `Belgien (BEL)` → Norway, a
  South African place → Sweden, and Halden/Larvik/Namsos (all Norwegian) →
  Sweden. Do not add an approve-all to that section; an e2e test asserts there
  isn't one.
- **Two country names, and they must not be swapped.** `countryName()` → Swedish,
  written into the data. `countryLabel()` → the reader's language, shown on
  screen. Both appear on this page at once.
- **`mutateJson` casts, it does not wrap.** It reads the body as
  `{ ok, warnings, data }`, so an endpoint returning a bare `{ changed: 3 }`
  gives `undefined` in the browser and the caller's destructure throws into its
  own catch — which looks exactly like a network failure. Every mutation
  endpoint must return the envelope. Unit and API tests both passed while this
  was broken; only e2e caught it.
- Every place links to whoever carries it, because **rejecting fixes nothing** —
  it only stops the offer. The link is the route to the record. Family events
  resolve to husband ?? wife; a marriage has no page.
- **A tidy version of a broken record is worse than a visibly broken one.** A
  country named as its own segment more than once is the export having joined
  two records — `Hemsö, Västernorrland, Sweden, Hemsö, Västernorrland, Sverige`.
  Removing one country leaves the place still doubled. Refused, not tidied, the
  same as when the two halves name different countries.
- The queue proposes only when the **country** changes. It used to offer
  whitespace fixes too, because `withCountryLast` collapses spacing on the way
  through — 12 of 59 proposals were double spaces.
- **A county code is data.** `Hassela (X)` says which Hassela; rebuilding a
  segment from its unbracketed text dropped it. Nine proposals would have
  deleted one.
- **A queue's e2e tests must build their own data.** The first version asserted
  on `Bjertrå` and `Vattingen`; four tests broke the moment the queue was
  cleared, because the feature had removed exactly what they were watching. They
  now create a person and three places per test — and a *different* parish per
  test, since a rejection is remembered by place text and hid the place from the
  test that ran next.
- `countryFromPlace` now reads all 697 ISO names, not the hand-written 21.
  `Sydafrika`, `Chile`, `Brazil` and `Tjeckien` were all in this tree and none
  counted as naming a country. It still trusts only the **last segment**.
- Only **rejections** persist (`place_country_rejections`, keyed by the place
  text, no fingerprint to orphan). Proposals are recomputed each request.
- The real database was **not** touched by any of this work: counts verified
  before and after, `place_country_rejections` still 0.

## Before publishing this repo — unresolved

Jens wants this on GitHub. **Four backup copies of the family database are in
git history**: `wedin.db.before-merge`, `.before-repair-conc`,
`.before-repair-conc.2` and `.before-restore`, ~27 MB, added in `ccc1f22`. Each
holds 4 561 people, 987 with no recorded death — living relatives, names, birth
dates, places. `.gitignore` had `*.db`, which does not match
`wedin.db.before-merge`: a glob needs the filename to *end* in `.db`.

`2e8e738` adds `*.db.*` and `backups/` to `.gitignore` and untracks the four
files (they remain on disk). **That does not touch history.** Anyone cloning the
published repo would still get every byte.

Deciding between a `git filter-repo` purge plus force-push, and publishing a
fresh repository with no ancestry, is Jens's call. Check before pushing:

```bash
git log --all --diff-filter=A --name-only -- '*.db*' 'backups/*'
```

## Where the work lives — read this first

`main` is **stale**: it points at an early Phase 1 commit. All real work is on
**`feat/phase1-scaffold-import`**. Everything since then sits on **`statistik`**
— by now far more than statistics — still unmerged. Check `git branch` before
assuming you are somewhere sensible.

## Countries in places (2026-08-12)

`PLAC` is free text in GEDCOM with **no controlled vocabulary** — the standard
gives a position (last segment, largest jurisdiction) and nothing else — so
canonicalising is entirely our decision. Sweden was written nine ways; it is now
`Sverige` and nothing else, 7 454 places.

**Canonical is the Swedish name.** `Sverige`, `Norge`, `Tyskland`. A place name
is data and stays as written; display stays language-independent because the
flags and statistics go through the ISO code, not the text.

Two traps, both found by measuring rather than by reasoning:

- **US state codes sit in the same position as Swedish county codes.** `WI`,
  `MN`, `AZ`, `TX`, `IL`, `CA`, `VA`, `IN`, `NV` all appear as a last segment.
  A rule reading "one or two letters at the end means a county code" would have
  moved Wisconsin to Sweden. `impliedCountry()` checks the **closed set** of 21
  county codes exactly; none of them collides with a US state code, and that is
  the only reason the rule is safe. Never match a shape here.
- **England and Scotland map to `GB` for the flag but are not spellings of
  Storbritannien.** The first dry run would have renamed six rows and thrown
  away the more precise thing the record said. `isSubdivisionName()` protects
  them, and the same applies to `Holland`.

**Two country names, and they must not be confused.** `countryName()` in
`lib/places.ts` gives the Swedish name and is what gets **written into a place
string** — the register's language. `countryLabel()` in `src/lib/i18n` goes
through `Intl.DisplayNames` and is what is **shown** — the reader's language.
So the statistics say "Sweden" in English and "Schweden" in German while the
place text says `Sverige` throughout, and the country select's options are
translated while the box beside it is not. That is the project's rule showing
through, not a bug.

Still true, and still deliberate: **a parish name is not evidence of a country.**
Only an explicit county code counts. 3 444 places still name no country.

Applied 2026-08-12 to all trees — 4 024 rows in wedin, 280 in Andersson och
Anders — event counts identical, `backups/wedin.db.before-places`.

Not touched, and a real inconsistency if you want it next: the province and
parish spellings themselves (`Gävleborg` vs `Gävleborgs län`, `Alnö` vs
`Alnön`). Much larger job.

## Dates have one shape (2026-08-12)

`lib/gedcomDate.ts` is now the only module that reads or writes a GEDCOM date,
and `events.date_raw` stays the single source of truth — canonical GEDCOM, with
`date_year` derived. **Nothing structured is stored beside it on purpose**: two
representations of one date can disagree, and the text is what has to survive an
export round trip.

The measurement that shaped the work: of 12 025 dated events, 2 387 were
*displaying* raw GEDCOM keywords because `QUALIFIERS` had no `between`, `from`
or `to` — a bigger problem by volume than the 49 rows that were genuinely
malformed. **The biggest date problem was a display bug, not a data one.** A
unit test had `expect(formatGedcomDate('BET 1916 AND 1928')).toBe('BET 1916 and
1928')` written into it as the expectation, which is how it survived; that is
the retro-fitted-test failure mode CLAUDE.md warns about, caught in the wild.

Three decisions worth not re-litigating:

- **A bare `TO 1965` is parsed as a period with an open start, never as
  "before".** Ten rows had it and they split evenly: five `DEAT TO 1803` mean
  *died by then*, five `OCCU/RESI/EDUC TO 1965` mean *until then*. The parser
  records what is written; `lib/dateCleanup.ts` makes the type-aware call.
- **Seven rows carry a qualifier nested inside a range** (`BET AFT 31 JAN 1762
  AND BEF 31 DEC 1762`). Valid GEDCOM that one `qualifier` field cannot hold. A
  per-part flag for seven rows would leak through the writer, the formatter and
  the input alike, so they fail to parse and are left completely alone —
  `looksLikeGedcom()` is what tells them apart from `arbrå`.
- **`INFANT` and `arbrå` are the same shape.** One is an age at death, one is a
  parish in the date column. Any rule that sorted one into the place column
  would be guessing at the other, so both went to the description and the dry
  run listed them for a human.

`scripts/date-report.ts` is read-only and worth re-running after any change to
the parser: it round-trips every date in every tree and reports what would be
rewritten. It is what proved the parser before anything was built on it.

**Applied 2026-08-12** to all three trees — 2 370 / 136 / 1 rows, event counts
identical, `backups/wedin.db.before-dates` (+ `-wal`, `-shm`). Nine dates remain
unreadable in `wedin.db`: the seven nested qualifiers, plus `31 juli` and
`6 aug.` — day and month with no year, which GEDCOM cannot express either.

Three rows lost a year from the sortable column because their text was
ambiguous: `30 jan. 2009 kl 17.06`, `25 ... 1738`, `30 ... 1738`. The text is in
each event's description and they are quick to re-enter by hand now that the
control exists.

**Not done:** the `unparseable-date` detector the spec calls for. Nothing yet
surfaces a bad date typed through the escape hatch.

## The person page's editing pattern (2026-08-12)

One pattern now, everywhere on the page: **the section's adding action sits on
the heading line, and the per-row controls are icons at the end of the row.**
*Add citation* already worked that way; *Add event* and *Add child / partner /
parent* were moved up to match, and the per-event *Edit*/*Remove* pair became a
pencil and a bin.

The part worth not undoing: an icon has no accessible name, so
`EventActions` names each button after what it acts on — `Remove Birth 15 Apr
1942`, via `edit.editNamed` / `edit.removeNamed` and `tf()`. A page with a
dozen events would otherwise hand a screen reader a dozen buttons called
*Edit*. The same string goes on `title` for a mouse. `EventActions` is shared
by `EventEditor` and `MarriageEditor`, so the wedding — which lives on the
family, not the person — behaves identically.

`EventEditor` renders its own `<h2>`, taking `title` as a prop, because the add
button and the `adding` state belong together and lifting that state into
`PersonPage` would have bought nothing.

The e2e check for this is geometric — the add button's `y` within 24px of its
heading's `y`, for all three sections — since "moved to the heading" is a fact
about layout that no text assertion would catch.

## The project is written in English (2026-08-11)

Jens asked for this so the repo can go on GitHub and be read by people who do
not speak Swedish: script output, test names, source language, URLs. Code,
comments, tests, routes, query parameters, storage keys, element ids and
terminal output are English. **The family data is Swedish and stays Swedish** —
names, places, notes, GEDCOM bodies, and the `sv` dictionary.

Decisions worth not re-litigating:

- **Clean break on URLs, no redirects.** `/wedin/personer` → `/wedin/people`;
  `trad`/`statistik`/`konsekvens`/`kallor`/`kalla`/`installningar` →
  `tree`/`statistics`/`issues`/`sources`/`source`/`settings`. A Swedish path
  now parses as an unknown tree and `rescueUrl` lands it on that tree's home
  page. The Swedish words stay in `RESERVED`, so a tree named "Källor" cannot
  occupy an address an old link points at.
- **Query parameters too**: `kategori`/`grad`/`avfardade`/`fodd`/`ort`/`upp`/
  `ned`/`vy` → `category`/`severity`/`dismissed`/`born`/`place`/`up`/`down`/
  `view`.
- **Storage keys were renamed with a migration.** `readPreference(key,
  legacyKey)` in `src/lib/storage.ts` reads the old Swedish name once and moves
  the value. Without it, renaming would have silently reset Jens's theme,
  language and open tree. Worth keeping until every browser has opened once.
- **Issue categories are codes, not sentences.** See Languages below. This was
  safe only because all three databases had **zero dismissals** — the
  fingerprint hashes the category, so with dismissals present this would have
  needed a migration. Re-check before touching fingerprints again.

Verification that mattered: the old and new detectors were run side by side on
all three real databases — 2 714, 288 and 2 problems, the same people flagged —
and every row count was identical before and after the whole job.

## The tree is in the address (2026-08-09)

Every page is `/<tree>/<page>`: `/wedin/people?q=jens+wedin`,
`/andersson/person/I500001`. **A link means one thing.**

Before this the tree lived only in `localStorage`, so `/person/I500001` meant
whichever tree the picker was last left on. That is not a hypothetical: Jens
pasted two person URLs, I resolved them against the wrong tree, and produced a
confident, coherent, wrong answer about his own family. Read
`src/lib/treeUrl.ts` before touching routing.

Decisions worth not re-litigating:

- **A tree's id comes from its database filename, never its display name.**
  `wedin.db` → `wedin`. Renaming a tree therefore cannot break a saved link.
  `default` still resolves as a legacy alias for the CLI and old browser state.
- **Route names are reserved ids** (`people`, `tree`, `source` …, plus the
  retired Swedish ones) so `/people` can only mean the People page.
- **Two kinds of bad address need opposite treatment.** `/people` is *missing*
  a tree → put one in front. `/deleted-tree/people` is *wrong* → swap it out.
  Prefixing the second gives `/wedin/deleted-tree/people`, which is no page.
- **The tree is adopted during render, not in an effect.** A page fetches on
  mount; an effect runs after that fetch has already gone out under the previous
  tree. `adoptTree()` sets it synchronously above the routes.
- Guards compare **resolved paths, not strings**. Once `wedin` and `default`
  both mean one file, a string check stops protecting it — the same shape as the
  `..%2Fwedin` traversal fixed the day before.

## Sources you can actually use (2026-08-11)

- **Transcription** on a source is the document written out, separate from
  **Note**, which is what *you* say about it. Maps to GEDCOM `SOUR.TEXT`
  and round-trips (there is a test with multi-line French, because CONC/CONT
  splitting is what mangles long text).
- **Fixed on the way:** the importer fell `TEXT` back into `note`, so 478 of 520
  sources held MyHeritage's own blurbs where a remark of your own belongs.
  `scripts/split-source-text.ts` separates them, moving only rows whose note
  provably came from a TEXT node — checked against raw tags, not guessed.
- **New source** and **Delete source** exist now; before, sources could only
  arrive by import. Deletion refuses while anything cites the source and says
  how many; 515 of 521 are cited, the heaviest 875 times.
- **Citations can be made by hand**, from either side. Every one of the 5 804
  imported citations was created by the importer and nothing in the app could
  add one — so a transcription was an island.

## Photos, one folder per tree (2026-08-10)

`media/wedin/`, `media/andersson/`. Media ids are per-database
integers, so **every tree owns a media 1**; the original tree used to sit loose
in `media/`, which is exactly where a collision would land on the photographs
that cannot be re-downloaded. `npm run media -- <tree>` downloads a tree's
photos; `scripts/move-media-into-tree-folder.ts` migrates an old layout by
rename, never copy.

## Data repair (2026-08-09 … 11)

- **Andersson: 504 → 486 people, 0 duplicate findings.** One branch
  imported twice, showing at three levels: Jens himself, his grandparents
  (invisible to the detector because one copy said "Anders Andersson" and the
  other "Anders **Bertil** Andersson"), and six Bergqvist children recorded
  under both of Anders Bergqvist's wives. The last were assigned by arithmetic:
  Karin was 6 in 1719, Elisabet died in 1733.
- **wedin.db: 220 duplicate event rows removed** across 58 people — leftovers
  from merges made before the engine stopped copying identical facts. Distinct
  facts before and after: 14 363 both times.
- `scripts/dedupe-events.ts`, `detach-child.ts`, `move-child.ts`,
  `drop-phantom-family.ts` all dry-run by default and write to the change log.

**The detector cannot see duplicates whose names differ.** Every hidden pair
found this week was one spelling variant apart. There are more in `wedin.db` —
Ingrid Katarina Nyström is two records (I501539/I501619), her father "Karl" in
one and "Carl" in the other.

## An incident worth remembering (2026-08-11)

A source titled "Test" appeared in the **real `wedin.db`** during a Playwright
run. Removed, and `/api/health` now reports which database the server is
serving, with an e2e test asserting it is the `.e2e/` copy and vite refusing to
start an e2e run pointed at the development port. I never identified the test
that did it — if it recurs, that guard is what will say so.

## Statistics (2026-08-08)

`/statistics` tells the family's story in numbers — deliberately *not* a
completeness dashboard, which is the consistency bench's job. Five query modules in
`lib/statistics/` (relatives, lives, names, families, places), composed by
`index.ts`, served by `api/statistics.ts`, rendered by `StatisticsPage` with one
component per section. Spec and plan:
`docs/superpowers/specs/2026-08-08-statistics-design.md`,
`docs/superpowers/plans/2026-08-08-statistics-page.md`.

Two decisions worth not re-litigating:

- **Scope is the bowtie** — a person's own ancestors ∪ own descendants. Walking
  parent *and* child links repeatedly reaches 4 070 of 4 561 people, which made
  the scoped view identical to the unscoped one. Bowtie gives 251 for Sven-Erik.
  The walk is BFS in JS (8 ms load, 0 ms walk); the recursive CTE took **4.5 s**.
- **Aggregate in JS, not SQL.** A scoped request filters by up to 4 561 ids;
  binding those as SQL parameters risks the variable limit and forces two code
  paths. Loading the rows and reducing them is a few ms and gives one path.

Guards that keep data errors out of the story, both mirroring Konsekvens:
lifespans ignore ages over 110 (three people, max 118) and spouse age gaps
ignore over 50 years (two couples: 61 and 111). Every figure states the
population it rests on — and note that the age gap rests on *couples with two
birth years* (772), not on *dated marriages* (435); mixing those up was a real
bug. Birth places group on the first comma part, which is approximate by design.

## Theme (2026-08-08)

shadcn preset `b2bkjK7NVw` → `radix-luma` / `olive`, applied with
`npx shadcn@latest init --preset … --pointer --force --no-reinstall`. Use **npx,
not pnpm dlx** — the repo is npm and pnpm would add a second lockfile. Existing
UI components were deliberately not reinstalled; they follow the theme through
its CSS variables anyway. The chart colours (`--chart-1…5`) come from the preset;
the tree's branch colours and grey canvas are fixed values outside the theme.

## Tree views (2026-08-07)

Four views on `/trad/:id`, chosen in the toolbar and stored in `?vy=`:
**Family** (the original), **Pedigree**, **Fan chart** and
**Lista**. The two ancestor views are built on `src/lib/ahnentafel.ts`
(numbering + the four branch colours) and share `useChartViewport`,
`PersonCard`, `ChartToolbar`, the flag preference and `TreePersonPanel`.
Layout maths lives in `pedigreeLayout.ts` and `fanLayout.ts`, both pure and
unit-tested. Plan: `docs/superpowers/plans/2026-08-07-pedigree-and-fan-views.md`.

Fan gotchas that took a fix: `<textPath>` follows the path direction, so arc
labels on the lower half need the arc drawn backwards; radial labels on the
left half need a 180° flip and `text-anchor: end`; and labels must be truncated
to the arc length their slice actually has, or they bleed into neighbours.

## Languages (2026-08-07, source language flipped 2026-08-11)

UI in en/sv/de/es. **English is the source language and the fallback**;
`src/lib/i18n/dictionaries.ts` leads with `en`, and `Dict = typeof en`. A browser
with no stored preference opens in English. `src/lib/i18n/index.ts` is the store:
`t()` stays a plain function reading a module variable, and `useLanguage()` in
`App` re-renders the tree on change. Event labels, month names, date qualifiers
and number grouping are per language. A test asserts all four dictionaries have
identical key sets — add a key to English and it tells you which translations
are missing.

**Consistency problems and the change history are translated too**, since
2026-08-11. The detector reports a code plus the values behind it
(`child-born-after-parent-died` with `{child, childBirth, role, parent,
parentDeath}`) and `src/lib/issueText.ts` builds the sentence. `role` resolves to
both `{role}` and `{roleOwner}` because Swedish wants a possessive where English
wants a preposition — do not simplify that away.

Not translated on purpose: record content — names, places, notes. That is
genealogical data, not UI.

## Data integrity fixes (2026-08-08)

Three real defects, all found by checking output against the real database
rather than trusting the tests:

- **MyHeritage never writes `CONT`.** All 10 190 continuations in the export are
  `CONC`, including the ones meaning "new line", so citations arrived as
  `Sven-Erik WedinKön: ManHemvist: Sundsvall`. The parser now reads a `CONC`
  after a line that never reached the limit as a line break. **The limit is
  counted in bytes** — "ö" costs two, so a full line can be 196 characters, and
  measuring characters put breaks inside words. `npm run repair-conc` fixed the
  existing database without re-importing (which would have discarded hand
  edits): it only rewrites a field when the sole difference is where breaks
  fall, and skips anything in `audit_log`. 1 108 fields repaired.
- **Export lost 3 519 citations' text.** The mapper lifts `TEXT` out of `DATA`
  and keeps `DATA`'s other children in `raw_tags`; the exporter wrote those back
  as *two* `DATA` nodes and the reader kept the last, which had no text. Now one
  node. With a stray `CR` also cleaned at parse time, the round trip is finally
  exact: all seven tables byte-identical.
- **Notes are HTML, escaped twice over.** `src/lib/richText.ts` decodes until it
  settles, then strips only *known* tag names — `<Privat>` is MyHeritage's
  placeholder for a living relative and a generic "looks like a tag" rule ate it.
  Display-only; the stored value is untouched so export stays lossless.

## Current state

- **Data** (`wedin.db`): 4 511 people, 979 families, 14 357 events, 5 805
  citations, 521 sources, 977 photos. Two further trees: Andersson
  (486 people) and Test (3).
- **Tests**: 604 vitest + 87 Playwright e2e, all green. The e2e suite runs with
  one worker — the specs share `.e2e.db` and would race. `tsc -b` clean.
- **Consistency**: 2 714 problems in `wedin.db`, 288 in Andersson, 2 in
  Test. Zero dismissals anywhere.

## Built (see docs/superpowers/plans/ for the per-phase plans)

1. Import + photos — GEDCOM parser, mapper, import CLI with a count check,
   photo download, `refresh-media`.
2. Browse — person list, person page, i18n.
3. Tree — SVG + d3-hierarchy, list view.
4. Editing — fields, events, relations, audit_log.
5. The consistency bench — 28 detectors, a review queue, the merge engine.
6. Sources + export — source pages, GEDCOM 5.5.1 export (round-trip verified).

Plus a UX round on the tree (2026-08-07): portraits on the cards, narrower cards
with the picture on top, country flags with an on/off toggle, partners drawn as
a couple with a marriage line, absolute zoom, a full-screen layout, and a person
panel on click.

## Gotchas worth remembering

- **Drizzle raw SQL**: an interpolated `${persons.id}` inside a `sql` fragment
  renders unqualified and binds to the wrong table in a correlated subquery.
  Write the qualifier literally (`persons.id`). Bit us in `lib/queries.ts`.
- **zod 4** `z.record(z.enum(...), v)` requires *every* enum key — it silently
  rejected the UI's empty `fieldChoices` and broke every merge. Use
  `z.object({...}).partial()`.
- **`I88888888`** is a MyHeritage placeholder person ("Unassociated photos").
  Detectors skip it and id generation ignores ids ≥ 10 000 000, but it still
  shows up in person search.
- **`1 DEAT Y`**: the `Y` is a GEDCOM flag, not text. Kept in the database for
  lossless export, filtered from display via `eventDescription()` in i18n.
- **e2e mutates data** → runs against `.e2e.db` (copied from `wedin.db` by
  `e2e/global-setup.ts`) on ports 5199/3199. Never point it at the real db.
- Reading `.e2e.db` right after a run can show pre-mutation state while SQLite
  checkpoints its WAL — not a bug.
- Playwright `.check()`/`.uncheck()` fight React checkboxes driven by URL state;
  use `.click()` + `toBeChecked()`.
- `wedin.db` lives in the **repo root**, not `db/`.
- **`sqlite3 -readonly` fails on a WAL database with no `-shm`** ("unable to
  open database file (14)") and prints *nothing* — easy to misread as "verified,
  no rows". Drop `-readonly` when checking a copy.
- **Copy `-wal` and `-shm` with the `.db`.** `e2e/global-setup.ts` copied only
  the main file for months, so the suite tested a stale snapshot; fixing it made
  three tests fail on data Jens had since cleaned up.
- **The i18n key-parity test does not catch a key in the wrong namespace.** It
  checks the four dictionaries agree with each other, not that `t()` looks where
  the key sits. Twice this week keys landed beside `category:` — which is
  `issues`, not `sources` — and rendered as raw key names.
- **A `<label>` wrapping a `<select>` takes the chosen option into its
  accessible name**, so the field announces itself as "Visa Alla (58)". Use
  `htmlFor` + `id`.
- Compare checksums with the **same algorithm** on both sides. `md5` before and
  `shasum` after is not a comparison; use file mtimes for "was this touched".
- **The unit tests run in node, which has no `localStorage`.** Every preference
  read is inside a try/catch, so those paths were passing by never reaching
  storage at all. `vitest.setup.ts` now installs an in-memory stub.
- **An untyped `Map` turns everything read from it into `any`.**
  `new Map(cond ? entries : [])` in `lib/issueLog.ts` widened to `Map<any, any>`
  and hid a field that no longer existed — it compiled for a while and failed
  only at runtime. Give a `Map` its type arguments.
- **Don't require the same placeholders in every translation.** Languages need
  different constructions; the test that matters is that each placeholder a
  template uses actually gets filled.
- **Scratch `.spec.ts` files anywhere in the repo get picked up by vitest.**
  A screenshot spec parked in `.baseline/` failed the unit run.
- **A glob needs the filename to *end* in the pattern.** `*.db` does not match
  `wedin.db.before-merge`. Check ignore rules by listing what is **tracked**
  (`git ls-files | grep …`), never by reading the patterns and assuming.
- **A passing test on code you expected to fail is a finding, not a relief.**
  Six storage tests passed because the environment had no `localStorage` and the
  defensive catch handed back the default.

## Open threads

- **`statistik` is unmerged** into `feat/phase1-scaffold-import`. It now carries
  the whole week's work, not just statistics.
- **Hidden duplicates in `wedin.db`.** The name+year detector misses pairs one
  spelling apart. Ingrid Katarina Nyström (I501539 / I501619) is a known one.
  A sweep for same-birth-date, near-identical-name records is the natural next
  data job — but show Jens candidates before merging anything.
- **Andersson leftovers:** Erik Andersson (b. 1839) is now childless and
  is probably Anders's *grandfather*, a generation collapsed at import; two
  people are attached to no family at all; Karin Elisabet Bergqvist has two
  death dates (1763 and 1812) and a christening eight days before her birth.
- **Immigration events that are moves within Sweden.** MyHeritage mapped
  Swedish parish moves onto `IMMI`, so "Immigration · Mariestad · 1849" is a
  household move. Relabelling would mean overriding the export; ask first.
- **The scan of a document cannot be attached to its source.**
  `media.ownerType` is `person | family`. Jens chose to hang scans on a person
  for now; widening it is a small migration when he wants it.
- **Backups in `backups/`** from this week's repairs — safe to delete once the
  data is trusted. Also the older `wedin.db.before-*` files in the repo root.
- **Jens has more UX/UI feedback coming** — that is the natural next work. The
  first round (2026-08-12) was the person page's editing controls. Two places
  still use the old shape and are the obvious next candidates if he wants the
  pattern carried further: the citation lines, whose *Remove citation* is a
  word inside a sentence, and `AddRelativeDialog` in the tree chart, whose
  relation buttons have no icons.
- **Commit messages are English from 2026-08-11 onward.** Earlier history is
  Swedish and is not being rewritten.
- **API error messages are English strings, not translated.** They reach the
  user as raw text through `err.message`; doing it properly needs error codes
  and dictionary entries. Known gap, written down in the spec.
- The live MyHeritage tree drifted after the July export. Decide whether to
  re-import from a fresh cleaned export before doing serious editing here.
