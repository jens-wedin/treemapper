# Treemapper

A local-first genealogy web app: import a GEDCOM, then browse, edit, chart, and
clean up a family tree — all on your own machine, with no account and nothing
uploaded.

Vite + React + TypeScript + Tailwind + shadcn/ui on the front; Hono +
better-sqlite3 + drizzle-orm on the back; vitest and Playwright for tests.

The project is written in English — code, comments, tests, routes and terminal
output. Record content (names, places, notes) is left exactly as entered.

## Setup

```bash
npm install
npm run dev            # app on :5173, API on :3001
```

A fresh clone has **no family tree**, and the app does nothing until you make
one — two ways:

- **Import a GEDCOM** export from Ancestry, MyHeritage, Geni or another program
  (Settings → Import family tree), or
- **Start an empty tree** and add people by hand (Settings → Create an empty
  family tree).

**The name you give decides the filename.** `My Family` becomes
`trees/my-family.db`, addressed at `/my-family` in every link; accented letters
are folded so an id is safe in a path. The terminal does the same:

```bash
npm run import -- family.ged "My Family"    # → trees/my-family.db
```

Nothing is uploaded; every database is a file under `trees/` on your machine.

## How it's organised

**One SQLite file per tree.** The app holds several unconnected trees, one `.db`
file each, chosen with a picker in the header. GEDCOM xrefs are only unique
inside one file — one tree's `I500097` and another's are different people — so
separate files keep them from mixing, and deleting a tree is deleting a file. A
tree's name lives in a `tree_meta` row inside the file, so there's no central
registry to drift out of sync.

| Path | Holds |
|---|---|
| `trees/<id>.db` | one database per tree (`TREEMAPPER_TREES_DIR`, default `trees/`) |
| `media/<id>/` | photos, one folder per tree (`TREEMAPPER_MEDIA_DIR`) |

`TREEMAPPER_DB` overrides the default tree's path.

**The tree is in the address.** Every page is `/<tree>/<page>` —
`/my-family/people`, `/my-family/person/I500001` — so a link means one thing. A
tree's id comes from its filename, never its display name, so renaming a tree
can't break an existing link. Route names (`people`, `tree`, `source`, …) are
reserved.

## Features

- **Browse** — a searchable person list (name, birth year, birth place) and a
  read-only person page with photos, a clickable family box, an event timeline
  with citations, and notes.
- **The tree** — four views switched in the toolbar and remembered in the URL:
  **Family** (ancestors up, descendants down, partners as couples), **Pedigree**
  and **Fan chart** (ancestors only, colour-coded by the four grandparent lines,
  unfoldable one branch at a time), and **List** (the accessible equivalent).
  Pan/zoom, a person panel, country flags and full keyboard navigation
  throughout; the pedigree morphs into the fan on a view change.
- **Editing** — in-place editing of fields, events and relations on the person
  page, behind guided dialogs and the app's own confirm dialog. Structured date
  entry (kind + day/month/year, with a free-text escape hatch) and a place field
  with a country select. Every mutation is validated with shared zod schemas and
  written to `audit_log` with full before/after snapshots, so any change can be
  traced and reversed.
- **The consistency bench** — 28 deterministic detectors plus completeness
  checks flag problems (born before a parent, duplicates, missing dates …),
  grouped by severity with Fix / Dismiss. Issues are computed, never stored, so
  fixing the data clears them. A side-by-side **duplicate merge** moves every
  event, citation and photo to the survivor in one transaction, and `npm run
  merge-duplicates` folds up a branch that was imported several times over.
- **Sources** — a source list with citation counts; sources you can create,
  delete (refused while anything cites them), transcribe (GEDCOM `SOUR.TEXT`)
  and cite by hand from either side.
- **Statistics** — the tree's story in numbers (lives, names, families, places),
  for the whole tree or one person's ancestors-and-descendants; every figure
  states the population it rests on.
- **Countries** — fills in the country of a place that names none, one approval
  at a time, learned from the tree itself rather than an outside list; nothing
  reaches the network and every change is audit-logged.
- **Export** — GEDCOM 5.5.1, round-trip verified: exporting and re-importing
  reproduces every table exactly, re-emitting the `raw_tags` subtrees for
  structures the app doesn't model.

## Languages

The interface is available in **English, Swedish, German and Spanish**, picked in
the header and remembered between visits (it also sets `<html lang>` before the
first paint). **English is the source language and the fallback**; a browser
with no stored preference opens in English, and a unit test asserts all four
dictionaries carry the same keys. Detectors report a code plus the values behind
it and the UI builds the sentence per language — record content is never
translated.

## Light and dark mode

Follow system / Light / Dark, remembered and applied before the first paint.
Chart colours are CSS variables the `.dark` block swaps (SVG fills can't use
Tailwind's `dark:` variant); national flag colours are deliberately not themed.

## Data safety

**The repo holds code, never family data.** `trees/`, `media/`, `data/` and
`backups/` are gitignored. A complete backup is a GEDCOM export (`npm run
export`) plus a copy of `media/` — photos are links in a GEDCOM, not files.
Copying a `.db` directly also preserves the audit log and dismissals; copy its
`-wal` and `-shm` alongside it, or you get a stale snapshot.

## Commands

```bash
npm run dev            # app on :5173, API on :3001
npm test               # vitest
npm run test:e2e       # Playwright, against a copy under .e2e/ — never live data
npm run build          # tsc -b && vite build
```

Data tools:

```bash
npm run import -- <file.ged> "<name>"        # create a new tree from a GEDCOM
npm run media -- <tree>                      # download a tree's photos
npm run export -- [path]                     # write the tree out as GEDCOM 5.5.1
npm run merge-duplicates -- <person-id> ...  # fold up a re-imported branch
```

`import`, `media` and `export` act immediately. The repair and normalisation
scripts under `scripts/` are **dry-run by default** — they print what they would
change and write only when passed `--apply`; the ones that mutate a tree in
place (`merge-duplicates`, `repair-conc`) back the database up first.

## Project layout

- `src/` — the React app (`components/`, `hooks/`, `lib/`); pure logic (layout,
  ahnentafel, dates, i18n) lives in `src/lib/`, where it is unit-tested.
- `lib/` — server-side queries, detectors, mutations, merge, GEDCOM
  parser/exporter.
- `api/` — the Hono server.
- `db/` — drizzle schema and migrations.
- `scripts/` — data tools.

`CLAUDE.md` holds the conventions and traps; `MEMORY.md` holds current state and
open threads.

## License

MIT — see [LICENSE](LICENSE).
