# MEMORY — where the project stands

_Last updated: 2026-08-11. All six spec phases are built, plus tree UX work, a
shadcn theme, Statistics, multiple family trees, the tree in every URL, sources
you can write out and cite by hand, several rounds of data repair — and the
whole project moved to English._

## Where the work lives — read this first

`main` is **stale**: it points at an early Phase 1 commit. All real work is on
**`feat/phase1-scaffold-import`**. Everything since then sits on **`statistik`**
— by now far more than statistics — still unmerged. Check `git branch` before
assuming you are somewhere sensible.

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
  citations, 521 sources, 978 photos. Two further trees: Andersson
  (486 people) and Test (3).
- **Tests**: 466 vitest + 80 Playwright e2e, all green. The e2e suite runs with
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
- **Jens has more UX/UI feedback coming** — that is the natural next work.
- **Commit messages are English from 2026-08-11 onward.** Earlier history is
  Swedish and is not being rewritten.
- **API error messages are English strings, not translated.** They reach the
  user as raw text through `err.message`; doing it properly needs error codes
  and dictionary entries. Known gap, written down in the spec.
- The live MyHeritage tree drifted after the July export. Decide whether to
  re-import from a fresh cleaned export before doing serious editing here.
