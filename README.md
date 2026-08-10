# Wedin släktträd

Web app that replaces MyHeritage for the Wedin family tree: browse, edit,
fix consistency problems (Konsekvensproblem), and manage sources. Local-first
(SQLite); designed to move to Vercel + Neon later.

Design spec: `docs/superpowers/specs/2026-08-05-wedin-tree-design.md`.

## Setup

```bash
npm install
npm run import   # one-time: data/Wedin_Family_Tree_CLEANED.ged → wedin.db
                 # (further trees are imported in the app, see Flera släktträd)
npm run media    # download photos from MyHeritage CDN → media/
npm run dev      # http://localhost:5173 (API on :3001)
npm test         # vitest unit tests
npm run test:e2e # Playwright browse flow (needs wedin.db)
```

## Övergångar mellan trädvyerna

Switching view cross-fades rather than cuts, and **Antavla → Solfjäder morphs**:
each ancestor travels from their column to their ring. The two views draw the
same people under the same Ahnentafel numbers, which is what makes a morph
meaningful there and nowhere else — the family view also draws descendants, and
most of its cards have nowhere to travel to.

The motion is interpolated in **polar coordinates about the fan's centre**
(`src/lib/ancestorMorph.ts`, pure and unit-tested). Straight x/y lines would
look like boxes sliding into a circle; moving along radius and angle makes each
path curve outward on its own. Only the position travels — a rectangle cannot
become a wedge, so during the morph each ancestor is a small marker in their
branch colour, with the cards fading out and the wedges fading in either side.

The easing is ease-in-out rather than the ease-out used for the fold glides: the
markers have to sit still on their cards while the antavla fades, and settle
before the solfjäder appears. `prefers-reduced-motion: reduce` skips both the
cross-fade and the morph.

## Flera släktträd

The app holds **several unconnected family trees**, one SQLite file each, and a
picker in the header chooses which one is on screen. Importing a GEDCOM from
**Inställningar → Importera släktträd** creates a *new* tree; nothing existing
is touched, matched or merged. **Inställningar → Skapa tomt släktträd** starts
one from nothing, for a family built up by hand — the first person is added
with **Ny person** on the Personer page, which is also how to record someone
whose place in the family is not known yet.

One file per tree rather than a `treeId` column, because **GEDCOM xrefs are only
unique inside one file** — this tree's `I500097` and a cousin's `I500097` are
different people. Separate files make that mix-up impossible and reduce deleting
a tree to deleting a file.

| Where | What |
|---|---|
| `wedin.db` (`WEDIN_DB`) | The tree that was here first, id `wedin`. Owned by the CLI scripts, and not deletable from the UI. |
| `trees/<id>.db` (`WEDIN_TREES_DIR`) | One file per imported tree. |
| `media/`, `media/<id>/` | Photos, per tree. |

A tree's name lives in a `tree_meta` row **inside** the tree, so there is no
central registry to drift out of sync or lose when a `.db` is copied. A database
opened without one is named after its file and can be renamed in the UI.

### The tree is in the address

Every page is `/<tree>/<page>` — `/wedin/personer?q=jens+wedin`,
`/andersson/person/I500001`. **A link means one thing.**

It did not always. The tree used to live only in the browser, so `/person/I500001`
showed whichever tree the picker was last left on: the same address was
Sven-Erik in one tree and someone else entirely in another. A bookmark rotted
the moment you looked at something else, and a link you sent someone showed them
a different person than you meant. This was not hypothetical — it produced a
long and confident investigation of the wrong tree.

A tree's id comes from its **filename**, never its display name, so renaming a
tree cannot break a link that already exists. `default` still resolves, for the
CLI and for browsers holding the old stored value.

Ids the router needs for itself — `personer`, `trad`, `kalla` … — are reserved,
because `/personer` has to mean the People page and could not also mean a tree
called "Personer".

Two kinds of address arrive without a valid tree, and they need opposite
treatment: `/personer` is *missing* one, so a tree is put in front; a deleted
`/grannslakten/personer` is *wrong*, so the tree is swapped out. Prefixing the
second would give `/wedin/grannslakten/personer`, which is no page at all.

Requests still carry `?tree=<id>`, added centrally in `src/lib/api.ts` — a query
parameter rather than a header because the GEDCOM export is a plain download
link, and links cannot set headers. The address is the authority; what the
browser stores is only a copy, so that a bare `/` returns you to the tree you
had open last.

**Photos are not downloaded at import.** A GEDCOM stores CDN links, not files, so
a new tree shows placeholders and the tree list says how many are pending.
Fetch them when you want them:

```bash
npm run media                        # the original tree
npm run media -- andersson  # a tree that was imported
```

Each tree downloads into **its own folder** — `media/`, `media/<id>/`. Media ids
are per-database integers, so every tree owns a media 1; one shared folder would
have the second tree silently overwrite the first tree's photographs.

MyHeritage's links are **signed and expire**. If the download reports HTTP 403,
take a fresh GEDCOM export and run `npm run refresh-media -- data/<export>.ged`
before trying again. The report lands in `data/media-report-<tree>.md`.

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

## Ljust och mörkt läge

A picker in the header: **Follow system / Light / Dark**, remembered between
visits and applied before the first paint so there is no light flash. While the
choice is "follow system" the app keeps tracking the OS — switching your laptop
to night mode changes it without a reload.

The theme's own colours come from the shadcn preset's `:root` and `.dark`
blocks. The charts could not use Tailwind's `dark:` variant, because their
colours are SVG fills and strokes set from JavaScript, so `src/index.css`
defines them as variables (`--branch-*`, `--card-*`, `--chart-canvas`,
`--chart-link`) that the `.dark` block swaps. They must be applied through
`style`, not as `fill`/`stroke` attributes — `fill="var(--x)"` does not resolve
as a presentation attribute.

The four branch hues keep their identity in both themes: pale tints on a light
canvas, deep tints on a dark one. **National flag colours are deliberately not
themed** — a Swedish flag is blue and yellow whatever the mode — and an e2e test
asserts exactly that while the cards around it do change.

## Browse

- `/` — Hem: search front and center + tree stats
- `/personer` — searchable person list (namn, födelseår, födelseort) with
  pagination; each row opens either the Personsida or the tree, since two
  records can share a name and dates and the tree is often the quickest way to
  tell them apart
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

### Visa konsekvenser

The toolbar's second checkbox marks everyone the Konsekvensbänken still has
something on, so you can see **where** in the tree the problems sit rather than
working a flat queue. It is off until asked for, remembered like the flag
toggle, and shared by all three charts.

Cards wear a badge in the top-right corner: the colour is their worst severity
(logiskt fel red, dubblett purple, varning amber, övrigt blue, småfel grey) and
the number is how many problems they carry. Hovering names the categories, and
the card's aria-label says the same in words. A fan wedge has no corner to put
a badge in, so it gets a plain dot in the same colour at its inner edge — the
one spot free of the name, the flag and the generation band at every ring.

Clicking the card opens the person panel, which lists the problems in the
queue's own wording at the foot of the panel, after the notes — a footnote to
the person rather than what the person is. **The Personsida ends the same way**,
and there it needs no toggle: you came to look at one person, and what the queue
has on them belongs with the rest of their record. Editing anything on that page
re-reads the register, so a problem you just fixed stops being reported without
a reload. Repeats of one category are gathered
under a single heading with a count: four children born after the same father
died is one fact told four times, not four headings.
The setting is a module-level store rather than component state, so ticking the
box in the toolbar fills in the panel beside it without a reload.

Nothing new is detected here: `/api/issues/persons` runs the same detectors as
the queue and folds them per person, so dismissing something there stops
marking it here. Everyone named by a problem is marked, not just the person who
owns the queue entry — a child born after its father died is worth spotting
from either card. The scan takes about half a second over the whole database,
so the charts fetch the register once and share it.

Be warned that **about half the tree carries at least one problem** (2 335 of
4 561 people, mostly the bulk warnings "Dödsfall utan datum" and "Vid liv men
för gammal"). The severity colours are what make the view usable: only 160
people have an outright logiskt fel.

All charts share the same pan/zoom, the same person panel on click, portraits,
flags and keyboard model. They sit on a soft grey canvas so the cards read as
cards, and the one under the pointer lifts on a drop shadow — SVG has no
box-shadow, so it is a `filter`, which follows the fan's wedges just as well
as the rectangular cards.

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

## Statistik

`/statistik` tells the family's story in numbers rather than reporting on data
quality — completeness and errors belong to Konsekvensbänken.

Four sections: **lives and lifespans** (sex split, longest lives, average
lifespan and births by century), **names** (most common given names by sex and
surnames), **families** (largest families, children per family, age at marriage,
spouse age gaps) and **places and work** (birth places, countries, migration,
occupations).

**Scope.** The whole tree by default; `?person=I500001` narrows every section to
that person's **own ancestors and own descendants** — 251 people for Sven-Erik,
492 for Erik Anders. Deliberately not "everyone related", which spreads through
cousins and in-laws to 4 070 of 4 561 people and would make the scoped view
indistinguishable from the unscoped one. The walk is breadth-first in JS over
the preloaded links; the recursive-CTE version took 4.5 s against 0 ms.

**Honesty rules.** Every figure states the population it rests on, because null
years are everywhere. Two guards keep data errors out of the story: lifespans
ignore ages over 110 (three people, topping out at 118) and spouse age gaps
ignore differences over 50 years (two couples, at 61 and 111). Both are things
Konsekvensbänken already flags.

**Approximate by design.** Birth places group on the first comma-separated part,
so "Alnö, Västernorrland, Sundsvall, Sverige" counts with a bare "Alnö". Across
1 795 distinct strings no rule is clean — the same rule also reduces a farm name
to itself and a county to a county — so the heading says "birth places", not
"parishes".

**Accessibility.** Every chart also renders its numbers as a table, the way the
tree has its list view.

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
and the detectors keep guarding future edits. The queue is grouped by severity
under its own heading, worst first (logiskt fel → dubblett → varning → övrigt →
småfel), filterable by severity and by category, with **Åtgärda** (jump to the
person) and **Avfärda** per issue. The list is capped at 500, so the filters are
how you reach the milder groups.

The same problem is reported once. Where the data holds a fact several times
over — one person has four identical "Bosatt" events after their death — each
copy used to raise its own flag, and the repeated cards shared a React key,
which left stale cards on screen when you changed the filter. Two issues with
the same fingerprint *and* the same owner are now folded into one (7 of 2 826).
The owner has to be part of that identity: the members of a duplicate group
deliberately share one fingerprint and each still needs its own card. Dismissals are
remembered by a fingerprint of the category, the people involved and the
offending values, so a dismissed issue stays gone — but legitimately reappears
if the underlying data changes.

**Åtgärdat och avfärdat** is a collapsed log at the top of the page: the latest
edits to the tree, from `audit_log`, interleaved with what has been dismissed.
Nothing links an edit to the issue it settled — issues are computed, so a fixed
one simply stops appearing, and the log says so rather than implying a
connection it cannot prove. The GEDCOM import is left out; it is not work done
on a problem. A dismissal names the problem it set aside by resolving its
fingerprint against the current detection, which the same request has already
run; where the problem no longer occurs, the entry says that instead.

### En gren som importerats flera gånger

Konsekvensbänken flags duplicates a pair at a time, which is the wrong shape of
tool when a MyHeritage export carries the same family four times over. `npm run
merge-duplicates -- <person-id> ...` walks the whole branch from a seed person,
clusters the records that are the same human and merges each cluster into its
best-sourced one. Dry run by default; `--apply` backs the database up first.

Three rules make it safe enough to run unattended:

- **Children before parents.** While the copies still hang under separate
  families, two siblings born on the same day are twins and are left alone;
  once the parents are one person they all sit in one family and that
  distinction is gone. Merging the parents last is also what lets the
  duplicated marriages collapse.
- **An exact birth date is required**, plus either the same name or the same
  spouse — the latter catches a married name written in a different order
  ("Brita Jonsdotter Forss" / "Brita Fors Jonsdotter").
- **Ambiguity is reported, never guessed.** Two records married to the same
  person *and* sharing children, but with different birth dates, are printed
  for you to judge: sharing children alone means nothing (every couple does),
  and sharing a spouse alone is what a widow's second marriage looks like.

Merging two people also **collapses families that turn out to be the same
couple twice**, moving the children, the marriage and its sources into the
older family. And `removeChildLink` exists for the one thing that blocks
everything else: an import can place someone as a child of a family they are
also a spouse in, and nobody can be their own parent.

**Duplicate merge** compares two records side by side; you pick which record
survives and which value wins per field. The merge moves every event, citation
and photo to the survivor, relinks families (collapsing duplicate child links,
never creating a self-marriage), deletes the duplicate, and writes one
`audit_log` row containing a complete before/after snapshot of every affected
record. It refuses to merge a person with themselves or two people in the same
ancestry line, and the whole operation is one transaction — a failure anywhere
leaves the tree untouched.

The Personsida ends with **Ändringshistorik**: what has been changed about
that person, newest first, read out of `audit_log`. Scoping it takes reading
the snapshots rather than the entity ids — an event belongs to its owner, a
child link to the child, a family to its spouses, a merge to the record that
stayed. A deleted event exists only in the before-image, which is exactly when
a log earns its keep.

## Editing

Removing something asks first, in the app's own dialog rather than the
browser's: it names the event in question, says the removal goes to the change
log, and follows the theme and the chosen language. All editing lives on the
Personsida: **Redigera** for names/kön/anteckning,
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
editing, Konsekvensbänken, and sources + export — plus two rounds of tree UX
work, the Statistik page, and the shadcn `radix-luma`/`olive` theme. Specs live
in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.

**313 unit tests and 37 end-to-end tests**, `tsc -b` and `npm run build` clean.
The e2e suite runs single-worker against a copy of the database (`.e2e.db`), so
it never touches the real one.

Note that `main` is stale — it points at an early Phase 1 commit. The work lives
on `feat/phase1-scaffold-import`, with the Statistik page on `statistik`.

`MEMORY.md` records where the work stands and the gotchas worth knowing before
picking it up again.
