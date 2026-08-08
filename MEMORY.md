# MEMORY — where the project stands

_Last updated: 2026-08-08. All six spec phases are built, plus two rounds of
tree UX work, three data-integrity fixes, a shadcn theme and a Statistik page._

## Where the work lives — read this first

`main` is **stale**: it points at an early Phase 1 commit. All real work is on
**`feat/phase1-scaffold-import`**. The Statistik page sits on **`statistik`**,
11 commits ahead of that branch and not yet merged. Check `git branch` before
assuming you are somewhere sensible.

## Statistik (2026-08-08)

`/statistik` tells the family's story in numbers — deliberately *not* a
completeness dashboard, which is Konsekvensbänken's job. Five query modules in
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
**Familj** (the original), **Antavla** (pedigree), **Solfjäder** (fan) and
**Lista**. The two ancestor views are built on `src/lib/ahnentafel.ts`
(numbering + the four branch colours) and share `useChartViewport`,
`PersonCard`, `ChartToolbar`, the flag preference and `TreePersonPanel`.
Layout maths lives in `pedigreeLayout.ts` and `fanLayout.ts`, both pure and
unit-tested. Plan: `docs/superpowers/plans/2026-08-07-pedigree-and-fan-views.md`.

Fan gotchas that took a fix: `<textPath>` follows the path direction, so arc
labels on the lower half need the arc drawn backwards; radial labels on the
left half need a 180° flip and `text-anchor: end`; and labels must be truncated
to the arc length their slice actually has, or they bleed into neighbours.

## Languages (2026-08-07)

UI in sv/en/de/es. `src/lib/i18n/dictionaries.ts` holds the four dictionaries
(Swedish is source + fallback), `src/lib/i18n/index.ts` the store: `t()` stays a
plain function reading a module variable, and `useLanguage()` in `App` re-renders
the tree on change. Event labels, month names and date qualifiers are per
language too. A test asserts all four dictionaries have identical key sets — add
a key to Swedish and that test tells you which translations are missing.

Not translated on purpose: record content (names, places, notes) and the
Konsekvens categories/messages, which the detectors generate in Swedish.
Translating those means moving `lib/issues.ts` to keys + params.

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

- **Data**: 4 561 personer, 983 familjer, 3 616 barnlänkar, 14 588 händelser,
  5 804 källhänvisningar, 520 källor, 985 foton (alla nedladdade, 425 MB).
- **Tests**: 313 vitest + 37 Playwright e2e, all green (e2e runs with one worker — they share .e2e.db). `tsc -b` clean,
  `npm run build` clean.
- **Konsekvens**: 2 831 problem över 2 275 personer (171 fel, 518 dubbletter,
  1 868 varningar, 251 övrigt, 23 småfel), 241 dubblettgrupper.

## Built (see docs/superpowers/plans/ for the per-phase plans)

1. Import + foton — GEDCOM-parser, mapper, import-CLI med antalskontroll,
   fotonedladdning, `refresh-media`.
2. Browse — personlista, Personsida, i18n.
3. Träd — SVG + d3-hierarchy, listvy.
4. Redigering — fält, händelser, relationer, audit_log.
5. Konsekvensbänken — 28 detektorer, granskningskö, merge-motor.
6. Källor + export — källsidor, GEDCOM 5.5.1-export (round-trip-verifierad).

Plus a UX round on the tree (2026-08-07): porträtt på korten, smalare kort med
bilden överst, landsflaggor med av/på, partner som par med vigselstreck,
absolut zoom, helskärmslayout, och personpanel vid klick.

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

## Open threads

- **`statistik` is unmerged.** Merge into `feat/phase1-scaffold-import` when
  Jens has looked at it.
- **`wedin.db.before-repair-conc` and `.2`** are pristine pre-repair backups in
  the repo root, untracked and safe to delete once the repaired data is trusted.
- **Jens has more UX/UI feedback coming** — that is the natural next work.
- The live MyHeritage tree drifted after the July export (4 572/985/522 vs our
  4 561/983/520). Decide whether to re-import from a fresh cleaned export
  before doing serious editing here.
- Country flags cover the Nordics plus common emigration destinations; add more
  in `src/components/CountryFlag.tsx` if a card turns up unflagged that
  shouldn't be.
- Konsekvens category "Vid liv men för gammal" reports 650 where MyHeritage
  says 200 — ours flags everyone missing death info who would be 111+. Narrow
  it if the queue feels noisy.
