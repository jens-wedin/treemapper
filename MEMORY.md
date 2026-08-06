# MEMORY — where the project stands

_Last updated: 2026-08-06, end of Phase 1._

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
