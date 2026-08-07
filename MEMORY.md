# MEMORY — where the project stands

_Last updated: 2026-08-07. All six spec phases are built; the tree view has had
a round of UX work on top._

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

## Current state

- **Data**: 4 561 personer, 983 familjer, 3 616 barnlänkar, 14 588 händelser,
  5 804 källhänvisningar, 520 källor, 985 foton (alla nedladdade, 425 MB).
- **Tests**: 213 vitest + 24 Playwright e2e, all green. `tsc -b` clean,
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
