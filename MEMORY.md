# MEMORY — where the project stands

_Last updated: 2026-08-06 — all six phases of the spec are built._

## Done: Phase 6 (Källor + export) — feature-complete

- Plan: `docs/superpowers/plans/2026-08-06-phase6-kallor-export.md`.
- `lib/sources.ts`, `lib/gedcomExport.ts`, `api/sources.ts`, `api/export.ts`,
  `scripts/export.ts`, `/kallor`, `/kalla/:id`, `/installningar`.
  168 vitest + 19 e2e green.
- **Round-trip verified on the real tree**: `npm run export` → `npm run import`
  reproduces all 7 tables exactly, only the 2 known BLES/NMR tag warnings.
- Export gotcha fixed: values carrying `\r\n` from the original import leaked a
  stray CR into exported lines; `splitValue` normalises line endings first.
- Photos are NOT in the GEDCOM (only URLs) — a full backup is the .ged file
  plus `media/`.

## Open

- **Jens has UX/UI feedback pending** — that's the natural next piece of work
  (spec §13 "polish"). Ask for it rather than guessing.
- The live MyHeritage tree drifted after the July export (4 572/985/522 vs our
  4 561/983/520); decide whether to re-import before serious editing.
- MyHeritage's pseudo-person `I88888888` ("Unassociated photos") still appears
  in person search; detectors already skip it.

## Done: Phase 5 (Konsekvensbänken)

- Plan: `docs/superpowers/plans/2026-08-06-phase5-konsekvensbanken.md`.
  **Scope decision (Jens, 2026-08-06): full MyHeritage parity, 28 categories**
  — not the spec's 13. Authoritative source is `data/konsekvensproblem.pdf`
  (MyHeritage's own report: 894 problems, 24 categories, thresholds and
  Swedish wording taken from it).
- `lib/issues.ts` (detectors + fingerprints), `lib/merge.ts` (merge engine),
  `api/issues.ts`, `api/merge.ts`, `/konsekvens` page + `DuplicateMerge`.
  149 vitest + 14 e2e green. Detection over the full tree takes ~0.6 s.
- Current state of the real tree: **2 831 problem, 2 275 flaggade personer**
  (171 error, 518 dubbletter, 1 868 varningar, 251 övrigt, 23 småfel);
  241 duplicate groups, 8 of them high-confidence.
- Calibration deltas vs MyHeritage, all deliberate: Vid liv men för gammal
  650 vs 200 (ours flags everyone missing death info who'd be 111+);
  Syskon med samma förnamn 72 vs 31 (we emit one per sibling, and skip the
  historically normal reuse of a dead sibling's name); stavningsvarianter
  lower because our GEDCOM is the cleaned copy.
- Bug worth remembering: **zod 4 `z.record(z.enum(...), v)` requires every
  key** — it rejected the UI's empty `fieldChoices` and broke every merge from
  the browser. Use `z.object({...}).partial()` for optional-key maps.
- Playwright `.check()`/`.uncheck()` fight React checkboxes driven by URL
  state; use `.click()` + `toBeChecked()`.

## Done: Phase 4 (Redigering + audit log)

- Plan: `docs/superpowers/plans/2026-08-06-phase4-editing.md` — fully executed.
- `lib/schemas.ts` (shared zod), `lib/mutations.ts` (transactional, audited),
  `api/mutations.ts` (PATCH persons, events CRUD, POST relations), edit UI in
  `src/components/edit/`. 100 vitest + 9 e2e green.
- **e2e now mutates data → runs against `.e2e.db`** (copy of wedin.db, made in
  `e2e/global-setup.ts`) on ports 5199/3199 via `npm run dev:e2e`.
  `createDb()` honours `WEDIN_DB`, server honours `API_PORT`.
- Gotcha found in real data: MyHeritage seeds a pseudo-person `I88888888`
  ("Unassociated photos") that broke id generation (new persons got I88888889);
  `nextId` now ignores ids ≥ 10 000 000. That pseudo-person also shows up in
  search results — worth hiding or cleaning in a later phase.
- Watch out when inspecting `.e2e.db` right after a run: reading during the
  WAL checkpoint can show pre-mutation state (looks like "nothing was saved").

## Done: Phase 3 (Träd)

- Plan: `docs/superpowers/plans/2026-08-06-phase3-trad.md` — fully executed.
  Owner decision: SVG + d3-hierarchy (layout math only), not WebGL/Three.js.
- `/trad/:id?upp=&ned=` (default focus I500001), `/api/tree/:id?up=&down=`,
  `lib/tree.ts` (cycle-guarded), `src/lib/treeLayout.ts` (path-based node keys
  — same person can appear twice under pedigree collapse), `TreeChart` (roving
  tabindex, wheel zoom via non-passive listener), `TreeList` (equivalent view).
- 71 vitest + 6 Playwright e2e green.
- Gotcha: `-0` from `-depth * STEP` fails `Object.is`-based assertions;
  playwright `section:has(> h2:text-is(...))` needed to avoid matching the
  page-level wrapper section.

## Done: Phase 2 (Browse)

- Plan: `docs/superpowers/plans/2026-08-06-phase2-browse.md` — fully executed.
- Routes `/`, `/personer`, `/person/:id`; API `/api/persons`, `/api/persons/:id/full`,
  `/api/media/:id`; i18n in `src/lib/i18n.ts`; query layer in `lib/queries.ts`.
- 59 vitest + 3 Playwright e2e green; `tsc -b` clean; build ok.
- Gotcha found: raw-SQL correlated subqueries must write `persons.id` literally —
  drizzle renders an interpolated `${persons.id}` unqualified, which SQLite
  resolves against the subquery's own table (see comment in `lib/queries.ts`).
- Vitest excludes `e2e/**` (Playwright owns `.spec.ts` there) — see vite.config.ts.


## Done: Phase 1 (scaffold + import + photo pipeline)

- Plan executed: `docs/superpowers/plans/2026-08-05-phase1-scaffold-import.md`
  (see its **Amendments** section — parser recovery, dead CDN links, refresh-media).
- Real import completed into `wedin.db` (gitignored): 4 561 personer, 983 familjer,
  520 källor, 14 588 händelser, 5 804 källhänvisningar, 985 foton.
  Count-verified against the export; report in `data/import-report.md` (2 331
  recovered malformed lines listed there — all note-text continuations).
- 42 tests green (`npm test`), `tsc -b` clean, `npm run build` works,
  `npm run dev` serves the Swedish shell with live stats on :5173 (API :3001).

## Photos: RESCUED (2026-08-06)

Jens provided a fresh export (`data/747450_3645859j0190k64i4da57a_A.ged`);
`refresh-media` matched all 985, `npm run media` downloaded **985/985, 0 failures**
(425 MB in `media/`, all rows `done`). Back up `wedin.db` + `media/` — the repo
doesn't hold them.

Note: the fresh export shows the live MyHeritage tree has drifted since the
cleaned July import (4 572 INDI / 985 FAM / 522 SOUR vs 4 561/983/520 in the
db). Recent MyHeritage edits are NOT in the database — worth deciding before
editing starts whether to re-import from a cleaned fresh export or accept the
July snapshot as the system of record.

## Next: Phase 2 — Browse (spec §13)

Person list/search, read-only Personsida, i18n foundation. Write a new plan
first (each phase = own plan → implement → commit cycle). shadcn/ui is
pre-configured (`components.json`, `src/lib/utils.ts`) but no components
installed yet.

## Gotchas for the next session

- `wedin.db` lives in the **repo root** (default of `createDb()`), not `db/`.
- `media.rawTags` carries `_PHOTO_RIN` — the stable key `refresh-media` matches on.
- The GEDCOM parser recovers garbage lines by appending to the previous node's
  value (`parseGedcom(text, warnings?)`); it only throws if the first content
  line is malformed.
- QUAY values in the data go up to 4 (MyHeritage extension beyond GEDCOM 0–3).
- 2026-08-05: two Claude sessions accidentally implemented in parallel; resolved
  by closing the other session. Check `git log` freshness before building.
