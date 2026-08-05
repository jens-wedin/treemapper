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
npm test
```

## Data

`data/` (gitignored) holds the MyHeritage GEDCOM export and reports.
`wedin.db` and `media/` (both gitignored) are the live database and photos —
back them up separately; the repo holds code only.
