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

## Språk / Language

The interface is available in **Swedish, English, German and Spanish**, picked
in the header and remembered between visits (it also sets `<html lang>`).
Swedish is the source language and the fallback for any key a translation
misses; a unit test asserts all four dictionaries carry the same keys.

Translation covers the interface itself, GEDCOM event names, date formatting
(month names and the `ABT`/`BEF`/`AFT` qualifiers) and the born/died
abbreviations. **Record content stays as entered** — names, places and notes are
genealogical data, not UI. The Konsekvens category names and problem
descriptions are produced by the detectors in Swedish and stay Swedish; the
page says so when another language is selected.

Adding a language means one dictionary in `src/lib/i18n/dictionaries.ts` plus
its event labels, month names and qualifiers.

## Browse

- `/` — Hem: search front and center + tree stats
- `/personer` — searchable person list (namn, födelseår, födelseort) with pagination
- `/person/:id` — read-only Personsida: photos, family box (clickable), event
  timeline with citations, notes
- `/trad/:id` — the interactive family tree (see below)

The export is verified lossless against the real tree: exporting all 4 561
people, 983 families, 14 588 events, 5 804 citations and 985 photos and reading
the file back gives byte-identical rows in all seven tables.

### Line breaks in imported text

GEDCOM has two continuation tags: `CONT` starts a new line, `CONC` joins with no
separator and exists only so a long value can be split across lines. MyHeritage
never writes `CONT` — all 10 190 continuations in our export are `CONC`,
including the ones that mean "new line". Read literally, that turns a citation
into `Sven-Erik WedinKön: ManHemvist: Sundsvall`.

A writer only has to continue a line once it is full, so `lib/gedcom/parser.ts`
treats a `CONC` after a line that never reached the limit as the line break it
was meant to be, and joins the rest silently. **The limit is counted in bytes**
— "ö" costs two, so a full line can be 196 characters, and measuring characters
put breaks in the middle of words.

`npm run repair-conc` applied this to the existing database without re-importing
(which would have discarded hand-made edits): it re-imports to a scratch copy
and only rewrites a field when the *sole* difference is where line breaks fall,
skipping anything named in `audit_log`. Add `--apply` to write; it backs the
database up first.

### Notes from the import

MyHeritage stores notes as HTML, and most of it is escaped — often twice over.
Left alone it shows up as `<p>` tags and `&auml;` in the middle of a sentence.
`src/lib/richText.ts` turns that into readable paragraphs at display time:
entities are decoded until they settle, `<br>` and block tags become line and
paragraph breaks, and the remaining tags are dropped.

Two things it deliberately does **not** do. It never renders the note as live
HTML — this is third-party content containing anchors and images, and there is
nothing in it worth executing. And it only strips *known* tag names, because
these notes are full of angle brackets that are not markup: `<Privat>` stands
in for a living relative and must survive.

The stored value is never rewritten, so the edit forms show the original markup
and GEDCOM export stays byte-for-byte lossless.

## Träd

`/trad/:id` has four views, switched in the toolbar and remembered in the URL
(`?vy=family|pedigree|fan|list`):

| Vy | Visar |
|---|---|
| **Familj** | Ancestors up and descendants down around one person, with partners as couples |
| **Antavla** | Classic left-to-right pedigree — ancestors only, 1–5 generations, unfoldable one branch at a time |
| **Solfjäder** | Circular fan chart — ancestors only, 1–5 generations |
| **Lista** | Nested lists; the accessible equivalent of all three charts |

The two ancestor views colour the four grandparent lines (father's father,
father's mother, mother's father, mother's mother) so you can see at a glance
which branch a person belongs to. Positions come from Ahnentafel numbering, so
a missing ancestor leaves an empty slot rather than shifting the rest of the
chart. In the fan, names run along the arc where there is room and radially
where there is not — and are turned around on the lower and left sides so
nothing reads upside down.

Five generations is the limit because it is as much as stays readable at once;
past that the whole chart shrinks rather than showing you more. Instead, cards
at the edge of the pedigree whose parents are on record but off the chart get a
**▸ button** that unfolds two more generations **in place** — the rest of the
chart stays exactly where it is, and so does the zoom. The button then turns
into **‹**, which folds the branch away again, taking anything opened inside it
along. Cards without a button are where the line genuinely ends in our data, so
the buttons double as a map of where there is more to find. Both are reachable
from the keyboard: right-arrow from a card stops at its button on the way to
its parents.

Unfolding re-flows the rows, so it is animated: cards already on screen glide
to their new places, new ones fade in, folded-away ones fade out, and the chart
eases across if the new branch would otherwise open off-screen. All of it is
disabled under `prefers-reduced-motion`.

All charts share the same pan/zoom, the same person panel on click, portraits,
flags and keyboard model.

### Familjevyn

Ancestors up, descendants down, 1–5 generations each way (d3-hierarchy does the
layout maths only).

- **Branch colours** match the pedigree and the fan: the four grandparent lines
  are coloured the same way in all three views, worked out from the same
  Ahnentafel numbering, so a person keeps their colour whichever view you are
  in. Descendants stay neutral — they belong to no grandparent line.
- **Unfolding** works like the pedigree's, but in both directions: a **⌃** above
  the topmost ancestors opens two more generations of parents, a **⌄** below the
  outermost descendants opens two more of children, and each turns into the
  opposite arrow to fold the branch away again. As in the pedigree it happens in
  place — nothing else moves, the zoom is kept, and the same glide/fade
  animations run. A ⌄ under a couple sits below their marriage bar, since that
  is where their children hang from.

- **Cards** carry the person's portrait on top — MyHeritage's primary photo when
  one is marked, otherwise the first downloaded one, with initials as fallback —
  then given name and surname on separate centred lines, then the years.
- **Couples**: anyone whose descendants are drawn appears beside their partner,
  joined by a marriage bar, and their children hang from that bar. Children of a
  second marriage hang from the right couple.
- **Flags** show the country of birth, but only when the birth place actually
  names a country (a bare parish is left unflagged rather than assumed Swedish).
  Toggle with "Visa flaggor"; the choice is remembered.
- **Clicking a card opens a details panel** — portrait, dates and places, family,
  events, notes — with buttons to re-centre the tree there or open the full
  Personsida. Relatives in the panel are clickable, so you can read around a
  family without moving the chart. Escape closes it.
- **Zoom is absolute**: 100 % means cards at their real size no matter how wide
  the tree is, range 4–300 %. The view fits the tree on load, "Återställ vy"
  returns to that fit, and the +/− buttons zoom around the focus person.
- **Keyboard**: arrow keys walk between relatives (the view pans to follow),
  Enter opens the panel. The "Lista" view is a fully equivalent path for screen
  readers.

## Källor och export

`/kallor` lists all 520 sources with how many citations each carries; a source
page shows its fields (editable, audit-logged) and every citation that uses it,
linked back to the person and event. Citations on a Personsida link the other
way, to the source.

`/installningar` exports the whole tree as **GEDCOM 5.5.1** — the backup and the
escape hatch out of this app, readable by MyHeritage, Ancestry, Gramps and
others. `npm run export -- [sökväg]` does the same from the terminal.

The export re-emits everything the import preserved, including the `raw_tags`
subtrees holding GEDCOM structures this app doesn't model. It is verified by a
round-trip test — export, re-parse through our own parser, compare — and by a
full-tree check: exporting and re-importing the real database reproduces every
table exactly (4 561 personer, 983 familjer, 3 616 barnlänkar, 14 588 händelser,
5 804 källhänvisningar, 985 media, 520 källor).

**Photos are not inside the GEDCOM** — only the links to them. A complete backup
is the exported `.ged` plus the `media/` folder.

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

API: `GET /api/stats` · `GET /api/persons` · `GET /api/persons/:id/full` ·
`PATCH /api/persons/:id` · `POST|PATCH|DELETE /api/events[/:id]` ·
`POST /api/relations` · `GET /api/media/:id` · `GET /api/tree/:id?up=&down=` ·
`GET /api/issues` + dismissals · `POST /api/merge` · `GET /api/sources`,
`GET /api/sources/:id/full`, `PATCH /api/sources/:id` ·
`GET /api/export/gedcom`. All UI copy lives in `src/lib/i18n.ts` (Swedish).

## Photos

**All 985 photos are downloaded** (425 MB in `media/`, done 2026-08-06).

MyHeritage's media URLs are *signed links that expire* — the ones in the July
2026 export were already dead (HTTP 403) and had to be re-armed from a fresh
export. If links ever need refreshing again:

1. Make a **fresh** GEDCOM export (with media links) in MyHeritage, put it in
   `data/`.
2. `npm run refresh-media -- data/<färsk-export>.ged` — re-arms the URLs on the
   existing database (matches photos by `_PHOTO_RIN`, then owner+filesize, then
   owner+title; already-downloaded photos are untouched).
3. `npm run media` — downloads with the fresh links; safe to re-run, it only
   retries what isn't done.

## Data and backups

`data/` (gitignored) holds the MyHeritage GEDCOM exports and reports
(`import-report.md`, `media-report.md` are written here).
`wedin.db` and `media/` (both gitignored) are the live database and photos.

**The repo holds code, never family data.** A complete backup is:

1. `npm run export` — the whole tree as GEDCOM 5.5.1, and
2. a copy of the `media/` folder (photos are not inside the GEDCOM).

Copying `wedin.db` itself also works and additionally preserves the audit log
and dismissed Konsekvens issues, which the GEDCOM does not carry.

## Project state

All six phases of the design spec are built: import + photos, browse, tree,
editing, Konsekvensbänken, and sources + export. Plans for each phase live in
`docs/superpowers/plans/`. `MEMORY.md` records where the work stands and the
gotchas worth knowing before picking it up again.
