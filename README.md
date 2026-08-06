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

API: `GET /api/stats`, `GET /api/persons`, `GET /api/persons/:id/full`,
`GET /api/media/:id`. All UI copy lives in `src/lib/i18n.ts` (Swedish).

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
