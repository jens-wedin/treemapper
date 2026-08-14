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

- **Import a GEDCOM** export from Ancestry, MyHeritage, Geni or another program —
  a `.ged` (5.5.1 or 7.0) or a `.gdz` GEDZIP, whose bundled photos are extracted
  into the tree as you import (Settings → Import family tree), or
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
- **Import** — GEDCOM **5.5.1 or 7.0** (auto-detected from the file), or a `.gdz`
  GEDZIP whose `gedcom.ged` is imported and whose bundled photos are unpacked into
  the tree's `media/` folder as ready-to-view media. Records the app doesn't model
  are preserved verbatim as `raw_records` so a round-trip loses nothing.
- **Export** — GEDCOM **5.5.1 or 7.0**, chosen per tree (7.0 is the default),
  round-trip verified: exporting and re-importing reproduces every table exactly,
  re-emitting the `raw_tags` subtrees for structures the app doesn't model. The
  7.0 writer uses `CONT`-only continuation, IANA media types, multimedia records
  referenced by pointers, and a `SCHMA` block declaring every extension tag.

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

## Validating GEDCOM 7.0 output

Our round-trip tests only prove that our own parser can read back what our own
writer produced — a self-check, not an interop check. For real conformance,
validate the 7.0 output against the official FamilySearch GEDCOM 7 rules.

```bash
npm run export -- out.ged --format=7.0
```

The privacy-safe way is **offline**, so nothing leaves the machine: clone the
reference validator
[`gedcom7code/js-gedcom`](https://github.com/gedcom7code/js-gedcom), fetch
FamilySearch's
[`g7validation.json`](https://github.com/FamilySearch/GEDCOM-registries/blob/main/generated_files/g7validation.json),
and run the export through it in Node. The online
[gedcom.io validator](https://gedcom.io/tools/#validation) works too — but
**never upload a real family database's export to a third-party web service**
(it contains living people); validate only a synthetic or fixture export there.

### GEDZIP (.gdz) validation

A `.gdz` archive is validated by unzipping it and running its `gedcom.ged` through
the same offline `js-gedcom` + `g7validation.json` recipe — the `gedcom.ged` inside
is valid 7.0, and all bundled photo entries are referenced by their bundle names
(e.g., `1.jpg`, `2.jpg`). The reference archive
[`maximal70.gdz`](https://gedcom.io/testfiles/gedcom70/maximal70.gdz) (from gedcom.io) demonstrates the format.

Export a `.gdz`:

```bash
npm run export -- out.gdz --gdz          # CLI
# or Settings → "Download GEDZIP (.gdz)"
```

Import one the same way you import a `.ged` — the CLI `npm run import` and
Settings → Import both accept a `.gdz`, unzip its `gedcom.ged`, and unpack the
bundled photos into the tree's `media/` folder (an extracted photo's on-disk
name is derived from its row id, never the archive entry name, so a crafted
archive can't write outside the folder).

## Commands

```bash
npm run dev            # app on :5173, API on :3001
npm test               # vitest
npm run test:e2e       # Playwright, against a copy under .e2e/ — never live data
npm run build          # tsc -b && vite build
```

Data tools:

```bash
npm run import -- <file.ged|.gdz> "<name>"   # create a new tree from a GEDCOM or GEDZIP
npm run media -- <tree>                      # download a tree's photos
npm run export -- [path] [--format=5.5.1|7.0]  # write the tree out (default: the tree's format, 7.0)
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

## Releasing

Versions follow [SemVer](https://semver.org), the changelog is [Keep a
Changelog](https://keepachangelog.com), and releases are automated from
[Conventional Commits](https://www.conventionalcommits.org) with
[release-please](https://github.com/googleapis/release-please). See
[RELEASING.md](RELEASING.md).

## License

MIT — see [LICENSE](LICENSE).
