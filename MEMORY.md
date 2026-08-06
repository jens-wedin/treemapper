# MEMORY — where the project stands

_Last updated: 2026-08-06, end of Phase 3._

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

## Next: Phase 4 — Editing (spec §13)

Person/event/family editing + audit log: in-place field editing on Personsida,
guided relation dialogs, zod validation both sides, every mutation writes
audit_log with before/after snapshots. Write its plan first.

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
