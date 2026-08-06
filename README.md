# Wedin släktträd

Web app that replaces MyHeritage for the Wedin family tree: browse, edit,
fix consistency problems (Konsekvensproblem), and manage sources. Local-first
(SQLite); designed to move to Vercel + Neon later.

Design spec: `docs/superpowers/specs/2026-08-05-wedin-tree-design.md`.

## Setup

```bash
npm install
npm run import   # one-time: data/Wedin_Family_Tree_CLEANED.ged → wedin.db
npm run media    # download photos from MyHeritage CDN → media/
npm run dev      # http://localhost:5173 (API on :3001)
npm test         # vitest unit tests
npm run test:e2e # Playwright browse flow (needs wedin.db)
```

## Browse

- `/` — Hem: search front and center + tree stats
- `/personer` — searchable person list (namn, födelseår, födelseort) with pagination
- `/person/:id` — read-only Personsida: photos, family box (clickable), event
  timeline with citations, notes
- `/trad/:id` — interactive SVG family tree (ancestors up, descendants down,
  1–5 generations each way): pan/zoom, click or Enter refocuses, arrow keys walk
  relatives, and a fully equivalent "Lista" view for screen readers/keyboard

## Konsekvensbänken

`/konsekvens` is the cleanup workbench. 28 deterministic detectors reproduce
MyHeritage's own consistency check (calibrated against
`data/konsekvensproblem.pdf` — its 894 problems in 24 categories) plus four
completeness categories from the data-quality report: saknar födelse, födelse/
dödsfall utan datum, and möjlig dubblett.

Issues are **computed, never stored** — fixing the data makes an issue vanish
and the detectors keep guarding future edits. The queue is sorted worst first
(logiskt fel → dubblett → varning → övrigt → småfel), filterable by category,
with **Åtgärda** (jump to the person) and **Avfärda** per issue. Dismissals are
remembered by a fingerprint of the category, the people involved and the
offending values, so a dismissed issue stays gone — but legitimately reappears
if the underlying data changes.

**Duplicate merge** compares two records side by side; you pick which record
survives and which value wins per field. The merge moves every event, citation
and photo to the survivor, relinks families (collapsing duplicate child links,
never creating a self-marriage), deletes the duplicate, and writes one
`audit_log` row containing a complete before/after snapshot of every affected
record. It refuses to merge a person with themselves or two people in the same
ancestry line, and the whole operation is one transaction — a failure anywhere
leaves the tree untouched.

## Editing

All editing lives on the Personsida: **Redigera** for names/kön/anteckning,
per-event **Redigera**/**Ta bort** plus **Lägg till händelse**, and guided
dialogs for **Lägg till barn/partner/förälder** (pick an existing person or
create a new one; family records are created and linked correctly).

Every mutation is validated with the shared zod schemas in `lib/schemas.ts` and
written to `audit_log` with full before/after JSON snapshots, so any change can
be traced and manually reversed. Impossible states (self-relations, ancestry
cycles, a third parent, duplicate children) are rejected with Swedish messages.
Fuzzy dates are always accepted — `ABT 1715`, `17xx`, free text — and only the
sortable year is left blank when it can't be parsed.

Note: `npm run test:e2e` mutates data, so it runs against a **copy**
(`.e2e.db`, recreated from `wedin.db` at the start of each run) on ports
5199/3199 — the real database is never touched by tests.

API: `GET /api/stats`, `GET /api/persons`, `GET /api/persons/:id/full`,
`GET /api/media/:id`, `GET /api/tree/:id?up=&down=`. All UI copy lives in
`src/lib/i18n.ts` (Swedish).

## Photos: the CDN links in the July 2026 export are dead

The media URLs in `Wedin_Family_Tree_CLEANED.ged` are signed MyHeritage CDN
links that expired ~2026-07-15; `npm run media` gets HTTP 403 on all 985 of
them (details in `data/media-report.md`). To rescue the photos while the
MyHeritage account is still active:

1. Make a **fresh** GEDCOM export (with media links) in MyHeritage and put it
   in `data/`.
2. `npm run refresh-media -- data/<färsk-export>.ged` — re-arms the URLs on
   the existing database (matches photos by `_PHOTO_RIN`, then owner+filesize,
   then owner+title; already-downloaded photos are untouched).
3. `npm run media` — downloads with the fresh links; safe to re-run, it only
   retries what isn't done.

## Data

`data/` (gitignored) holds the MyHeritage GEDCOM export and reports
(`import-report.md`, `media-report.md` are written here).
`wedin.db` and `media/` (both gitignored) are the live database and photos —
back them up separately; the repo holds code only.
