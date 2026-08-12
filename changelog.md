# Changelog

## [Unreleased]

### Changed

**Every family database lives in one folder**
- The default tree moved from `wedin.db` at the repository root to `trees/wedin.db`, in the same folder as every imported tree — the root no longer carries a database. Its id, its `wedin` slug and every link to it are unchanged, and `TREEMAPPER_DB` still overrides the location for the tests and the e2e copy.
- Because the default now sits inside the scanned directory, the tree list skips its own file so it appears once, as the default, and not a second time as a tree found sitting alongside the others.
- Loose `wedin.db.before-*` backup snapshots that had gathered at the repository root now live in `backups/` with the dated ones.

**Anyone can clone this and start their own family tree**
- The first run has no family tree at all, and says so. Previously `wedin.db` was written to disk as a side effect of asking whether it existed, so a stranger who cloned the repository was handed an empty tree named after somebody else's family, in a URL that said `wedin`.
- **The name decides the filename.** `Mormors släkt` becomes `trees/mormors-slakt.db` and is addressed at `/mormors-slakt`. That was already true of every tree except the first one; now it is true of all of them.
- `npm run import` takes the file and the tree's name, both required, and writes `trees/<name>.db` through the same path the browser uses. It used to default to one particular family's GEDCOM and one particular database. Its report is in English rather than Swedish, like everything else the terminal prints.
- `trees/wedin.db` still works, still has the id `wedin`, and every link to it is unchanged. It is simply no longer conjured into being.
- The navigation and the tree picker are hidden while there is no tree, since every address they could offer names one that does not exist.

**The project is written in English**
- Code, comments, tests, routes, query parameters, stored preference keys, element ids and terminal output. So that it can go on GitHub and be read by someone who does not speak Swedish. The family data is Swedish and stays Swedish: names, places, notes, GEDCOM bodies, and the Swedish translation of the interface.
- **English is now the source language.** `en` is the authored dictionary and the fallback; `sv` joins `de` and `es` as a translation. A browser with no stored preference opens in English. Every stored preference key was renamed, and each reads its old Swedish name once so the theme, the language and the tree you had open survive the change.
- **Routes are English, with no redirects.** `/wedin/personer` becomes `/wedin/people`; `trad`, `statistik`, `konsekvens`, `kallor`, `kalla` and `installningar` become `tree`, `statistics`, `issues`, `sources`, `source` and `settings`. Query parameters follow: `kategori`, `grad`, `avfardade`, `fodd`, `ort`, `upp`, `ned`, `vy` are now `category`, `severity`, `dismissed`, `born`, `place`, `up`, `down`, `view`. A Swedish path now reads as an unknown tree and lands on that tree's home page rather than rendering nothing. The Swedish words stay *reserved*, so a tree named "Källor" cannot occupy an address an old link still points at.

**Consistency problems are finally translatable**
- The detector's category *was* its Swedish sentence, so the queue was Swedish however the app was set — the page even said so, in a line that is now gone. Worse, the dismissal fingerprint was a hash of that sentence: rewording a message would have quietly un-dismissed everything it named.
- 28 stable codes replace them. `lib/issues.ts` reports `child-born-after-parent-died` with the values behind it, and the UI builds the sentence — in English, Swedish, German or Spanish. Verified against all three real databases: 2 714, 288 and 2 problems before and after, flagging the same people. Dismissals were re-checked as zero immediately beforehand, which is what made changing the fingerprint safe.
- Word order differs between the four languages, and Swedish wants a possessive (*efter faderns Abraham död 1800*) where English wants a preposition (*after their father Abraham died in 1800*), so `role` resolves to both `{role}` and `{roleOwner}` and each template takes the form its grammar needs.
- The change history got the same treatment — it was building *"Foto tillagt för X"* on the server — and so did the source page's *"Familj F12 — Vigsel"*. Both are computed at read time, so neither needed a migration. `lib/eventLabels.ts` is gone; the UI translates the GEDCOM tag itself.

**Numbers and dates follow the language**
- `toLocaleString('sv-SE')` was hard-coded at nineteen call sites, so an English page counted `14 357` with a Swedish space. A thousands separator is part of a translation, like everything else.

**The document says which language it is in**
- `startLanguage()` sets `<html lang>` before the first paint. `index.html` can only name one language and it names English, so a reader who had chosen Swedish was getting Swedish prose inside `<html lang="en">` — which is what sends a screen reader off in an English voice.

**Places that name no country can be given one, with your approval**
- 3 444 events carried a place that named no country at all — `Bjuråker`, `Alnö (Y)`, `Hedviqsfors (Bjuråker)`. The tree turns out to contain its own answer key: 7 871 of its places pair a parish with a country, so a bare `Bjuråker` is a lookup in what the family already recorded rather than a guess against an outside list. Nothing consults the network.
- A new **Countries** page, reached from Settings, offers each inference for approval. Grouped by the evidence rather than by the place, 1 253 places become **402 decisions**, each one a question with an obvious answer: *Bjuråker → Sweden · 77 places · 294 events · taught ×487*. Approving a group writes `, Sverige` into every event it covers; rejecting one is remembered so it is not offered again. Every changed row writes a before/after snapshot to `audit_log`.
- **Edit-distance matching is quarantined, not trusted.** All 125 of its matches were read against the real database and seven assign the wrong country — `Belgien (BEL)` to Norway, a South African place to Sweden, and Halden, Larvik and Namsos, all Norwegian, to Sweden. Those places are reviewed one at a time, with the near-miss spelled out (`Bjertrå ≈ bjärtrå`), and the section has no approve-all control at all.
- Country names are now read wherever they appear, from all 697 ISO names in the four languages the app speaks rather than a hand-written 21. That alone fixes places the record *already answered* and nothing could see: `Sydafrika`, `Rio De Janeiro, Brazil`, `Auschwitz (Polen)`, `Danzig, Ö Tyskland`, `Sweden.` with a full stop, and `Frisbo 17, Bjuråker, Sweden, Gävleborgs, Hälsingland` with the country stranded in the middle. These 88 are shown separately, because approving one rewrites text somebody wrote.
- Six abbreviated parishes are written out in full across 40 birth records: `Th.`→Torsö, `Ha.`→Hassela, `Bjr.`→Bjuråker, `Lax.`→Laxarby, `Trå.`→Timrå, `Svall.`→Sundsvall. Each takes the form that parish already carries most often in the tree, so no jurisdiction level is invented.
- `Th.` is written out as `Torsö, Skaraborgs, Västergötland, Sverige` on eleven birth records. It is an abbreviation of a real parish, not junk: all eleven siblings also have a residence at Bromö on Torsö, and each of these events carries an exact birth date. Expanded to the parish rather than the farm, since that is what the abbreviation says.
- The 28 residence events whose only place was `Census` are gone. MyHeritage writes the *source* into the place column when a fact comes from an enumeration, so these said nothing but "resided somewhere, 1876–1885" — no place, no description, no age, no citation. Every one is recoverable in full from `audit_log`.
- The queue refuses to tidy a record that needs splitting. A country named as its own segment twice is two records the export joined; removing one country leaves the place doubled and merely looks fixed. It is reported as unanswered instead, the same as when the two halves name different countries.
- A **Left for you** section lists everything still without a country, instead of only counting it — the same rows the report script prints, with the people linked. Each says why it is there: no evidence, an inference you turned down, a country inside a bracket, or two records the export joined.
- Every place links to the people whose records carry it. Rejecting an inference only stops it being offered again and leaves the place as wrong as it was, so the link is how a wrong answer actually gets corrected. A marriage has no page of its own, so a family event is listed against its husband or wife.
- 132 places have no evidence anywhere — `Bjr.`, `Ha.`, `Fattigstugan` — and are reported and left alone rather than guessed at.

**Countries are spelled one way**
- GEDCOM's `PLAC` is free text whose only rule is position — smallest jurisdiction first, largest last — with no controlled vocabulary and no country list anywhere in the standard. So Sweden was written nine ways: `Sverige` 3 667, `Sweden` 2 232, `SWEDEN` 12, `SE` 11, `Swe` 5, `sverige`, `SVerige`, `Suecia`, `sweden`. It is now `Sverige` 7 454, and nothing else.
- The canonical form is the **Swedish** name — `Sverige`, `Norge`, `Tyskland` — because a place name is data and stays as it was written in the register. What you see stays language-independent: the flags and the statistics go through the ISO code rather than the text.
- **A country is now known for 7 871 of 11 315 places, up from 6 265.** 2 435 spellings were renamed, and 1 589 places that carry a Swedish county code without naming the country — `Alnö (Y)`, `Umeå lfs, AC` — had it appended.
- **A parish is still not evidence.** `Bjuråker` is in Gävleborg and every reader knows it, but the record does not say so and nothing guesses on its behalf. Only an explicit county code counts.
- **The statistics name their countries.** The Countries list showed `SE`, `NO`, `US`; it now reads Sweden, Norway, United States — and Schweden, Norwegen, Vereinigte Staaten to a German reader, because the names come from `Intl.DisplayNames` rather than from a table that would need a fifth language adding by hand.
- The place field gained a **country select** beside it that reads and rewrites the last segment. The place itself stays a text box — the hierarchy here runs from one level to five — and a place ending in something the list has never heard of, like `Preussen`, shows *somewhere else* and is left alone.

**Dates have one shape now**
- The date field was one text box labelled *"Date (free text, e.g. ABT 1715)"*, which is how `arbrå`, `17xx`, `INFANT` and `4 juli 1814 el 1812` came to be stored as dates. It now asks for the kind of date — exact, about, before, after, between, period — and then day, month and year, any of which may be left blank, because a genealogical date is very often *March 1902* or just *1821*. A live preview says what will be stored and how it will read.
- **Ranges and periods are read out.** `QUALIFIERS` knew *about*, *before*, *after* and *and*, and nothing else, so 2 328 residences displayed as *"BET 1916 and 1928"* and 39 as *"FROM 1932 TO 1938"* — in English, Swedish, German and Spanish alike. A unit test had the wrong output written into it as its expectation, which is how it survived this long.
- **2 507 stored dates were brought to canonical GEDCOM**, across all three trees, with a before/after snapshot for every one. 2 328 residences recorded as an uncertain date became the periods they describe; 16 centuries written `17xx` became `BET 1700 AND 1799`; five deaths recorded as *"TO 1803"* became *"BEF 1803"*; 11 placeholders (`-`, `0`, `Unknown`, `okänt`) were cleared; and nine rows whose text was never a date had it moved into the event's description rather than guessed at or dropped.
- **Two shapes are deliberately left alone.** A bare `TO 1965` stays a period on an occupation and becomes a *before* only on a death, because ten rows split evenly between *died by then* and *was headmaster until then*. And seven rows carry a qualifier nested inside a range — `BET AFT 31 JAN 1762 AND BEF 31 DEC 1762` — which is valid GEDCOM that the model cannot hold; they keep their own text rather than being narrowed, and still read properly on the page.
- **An impossible date is refused, not stored.** The structured control was not, in fact, preventing malformed dates: `45 MAR 1902`, `0 MAR 1902`, `17 MAR 3` and `31 FEB 1902` all went straight into the date column. The day is now checked against the month it sits in — leap years included — and Save is disabled with the reason shown while the date cannot exist.
- 'Type it myself' keeps a text box for the shapes the form cannot express. What is typed is parsed when the box closes: if it is a date the boxes take it over, and if it is not, it is kept exactly as written and the form says so.

**A person's events read as events, not as buttons**
- Each row's *Edit* and *Remove* are icons at the end of the line. They are named after the event they act on — *Remove Birth 15 Apr 1942* — because a screen reader offered a dozen buttons all called *Edit* learns nothing from them, and a mouse gets the same wording as a tooltip. The removal still goes through the app's own confirmation, which still spells out what disappears, place included.
- Every section on the person page now offers its adding action on the heading line, the way **Add citation** already did: **Add event** beside *Events*, and **Add child / partner / parent** beside *Family*. The wedding, which is edited on the family rather than the person, took the same pair of icons.

### Security

**Backup copies of the family database are gone from history**
- Four of them, ~27 MB, had been committed since `ccc1f22`: `wedin.db.before-merge`, `.before-repair-conc`, `.before-repair-conc.2`, `.before-restore`. Each held 4 561 people, 987 with no recorded death — living relatives, with names, birth dates and places. `.gitignore` had `*.db`, which does not match `wedin.db.before-merge`, because a glob needs the filename to end in the pattern. `backups/` was unignored for the same reason.
- `*.db.*` and `backups/` are ignored, the files were untracked, and git history was rewritten with `git filter-repo` to purge every backup blob before the repo went public. Real family names in the tracked docs were replaced with synthetic placeholders for the same reason — the published repo holds code, not a family.

### Fixed

**Storage, tested for the first time**
- Every stored preference is wrapped in a try/catch, and the unit tests run in node, which has no `localStorage` — so those paths were passing by never reaching storage at all. The setup file now provides an in-memory one.

**"1 citations"**
- The refusal to delete a cited source counted in English but did not read in it.

### Added

**Citations can be made by hand**
- Did not exist at all: all 5 804 citations in wedin.db came from the import, and nothing in the app could create one. A transcription was therefore an island — you could write out the marriage record perfectly and Erik Nilsson's page would never mention it.
- Both directions, because you arrive from both: **Add person** on the source, when you are holding a document that names several people, and **Add source citation** on the person, when you have just found the parish record.
- Page, quality (GEDCOM's QUAY, shown as words rather than numbers) and the quotation. The quotation is what makes a citation worth having — without it you are pointing at a whole document with no idea which line sent you there.
- Removing a citation unties the link, not the document: the source stays.

**Sources can be deleted**
- **Delete source** on the source page. A plain DELETE refuses while anything cites the source and answers with the count: a citation is what a fact rests on, and deleting the source underneath one leaves people asserting things with the reason gone.
- The confirmation says how many citations go with it before you agree, not afterwards. The whole source and every removed citation sit in the change log's before-image, so the decision can be read back and rebuilt.

**Sources can be added**
- **Sources → New source** creates a source for a document you hold yourself. Did not exist before: the API could list, show and edit sources but not create one — so a document that had not arrived with an import could not be written out anywhere.
- The dialog asks only for the title and sends you to the source's own page, where the transcription has room. A dialog is the wrong shape for a page of handwriting.

**Sources can be transcribed**
- A new **Transkription** field holds the document written out, separate from **Anteckning**, which is what *you* say about the source. Line breaks are kept — in a transcription they are where the lines break on the page.
- Maps to GEDCOM's `SOUR.TEXT`, so a transcription survives an export and returns on re-import. A round-trip test sends multi-line text all the way out and back.
- **Fixed: the source's own words sat in the note field.** The importer let `TEXT` fall back to `note` when a source had no `NOTE`. That filled 478 of 520 sources with MyHeritage's own blurbs and left nowhere for a remark of your own. 478 moved in wedin.db, 30 in Andersson — only rows whose note provably came from a TEXT node, checked against the raw tags rather than guessed from the words.

**Emigration and immigration listed per person, not per move**
- Anna Jonsdotter moved four times in four years and filled four lines that differed only in the small grey text at the end. The list looked full of duplicates when it was describing a life of moving. The name is said once now, with the moves under it.
- Anyone who moved once stays on a single line. The order is unchanged: people appear by their most recent move.

**Emigration and immigration can be filtered one way at a time**
- A picker beside the heading shows only immigration or only emigration. The counts sit in the options — "Alla (58)", "Immigration (41)", "Emigration (17)" — so which way the family moved is answered before you choose anything.
- Filtered in the browser: the whole list already arrives (only the ranked lists are cut to ten), so it is instant and can never show a truncated list as if it were complete.

**Names in the statistics lead to the person**
- Every list on the statistics page answers a question that immediately provokes the next — who *was* the one who lived to 104? The names were plain text, so the way there was to copy the name into the search box, even though the id was already in the payload.
- Longest lives, Largest families, Age gap between spouses, Emigration and immigration, and the heading's "Statistics for X" now link to the person page. In a couple each spouse is linked separately — a couple is two people, and either of them may be the one being looked for.

**Add relatives straight from the chart**
- A checkbox in **Display settings** puts a small plus on every card. Off by default: browsing the tree is the common case, and a plus on every card is noise until the session is about filling gaps. The plus stays dimmed until the card is hovered or the plus has focus.
- The plus opens the same three choices the person page has — child, partner, parent — and the same form. Once saved, the chart redraws in place.
- `RelationForm` was split out of `RelationDialog`: a dialog inside a dialog cannot open, so the shell is now the caller's business and the form is shared. The person page opens it in its own dialog; the chart shows it in the dialog the card's plus already opened.
- The plus is a `<g role="button">` inside the SVG rather than a Radix trigger — the dialog is owned by the page, outside the chart.

**Marriage can be edited — on the family**
- Every family box on the person page now carries its marriage with **Add / Edit / Remove**. It was missing entirely, and deliberately so: marriage is not among a person's event types because in GEDCOM it belongs to the family, not to either spouse. That is also what makes it appear on both their pages and export as `FAM.MARR`.
- `EventForm` now takes an owner type and a locked type, so the same form serves both person events and marriages. The age field appears only for person events — a couple has two ages.
- `FamilyView.marriage` carries the event's id, which is what makes it editable in place.

**A family tree from nothing**
- **Fixed: the chart claimed the API was down.** `/trad` without an id started from `I500001`, which does not exist in a newly created tree — nor in any imported tree, whose xrefs are its own. The 404 was read as a broken API.
- The page now asks the tree who it has: without an id it lands on the first person, an empty tree gets its own message with a way to Personer, and an id that does not exist says exactly that.
- **Settings → Create an empty family tree** starts a tree with nothing in it, for a family built up by hand. You switch to it immediately.
- **Ny person** on the Personer page creates someone with no relative. Everyone else is added from an existing person's page — as child, partner or parent — which cannot start an empty tree. It is also the way in for someone whose place in the family is not yet known.
- The new tree's name field got an accessible name of its own: the import form's name field is on the same page, and two fields with the same accessible name cannot be told apart.

**Photos can be added and removed**
- A button by the Foton heading uploads an image to the person; the filename becomes the title. The section shows even for someone with no photos — otherwise there is nowhere to put the first one.
- Removal happens in the large view, where you can see what you are removing, behind a confirmation. **The row goes, the file stays.** The row can be read back from the change history; the picture may be the only copy of a face nobody living remembers.
- Uploaded files are stored like downloaded ones — `media/<tree>/<row id>.<ext>` — and `originalUrl` points at the file itself, so the export writes a FILE line that means something.
- **Fixed: the change history had no photos.** It decides what concerns a person from the record type, and `media` was never in the list — additions and removals were logged but never shown.
- e2e runs against its own media directory of symlinks to the real files: the suite reads every photo, but anything it uploads lands in the copy.

**Photos open large**
- Clicking a photo on the person page opens it as large as the screen allows. The thumbnails are cropped squares, so the picture on the page is not the picture — opening it is the only way to see what was actually photographed.
- Arrow keys move between a person's photos, the heading counts ("3 av 31"), and Escape closes. The thumbnail is a **button** rather than a clickable image, so keyboard and screen reader know it opens something.

**The tree can be thrown**
- Let go mid-drag and the canvas keeps rolling and slows down, like a list on a phone. Speed is measured over the **end** of the drag, not all of it — a pause on the way should not brake a flick that finishes fast — and decays exponentially: a linear stop has a visible moment where motion simply ceases.
- Grabbing the canvas mid-flight stops it dead. Zoom, reset and arrow keys also take over immediately.
- `prefers-reduced-motion: reduce` pans exactly as before and stops where the finger let go.

**The tree views turn into one another**
- Switching between Family, Pedigree, Fan and List is no longer a cut. The view being left stays over the one arriving during the transition, with `aria-hidden` and `inert`: a screen reader must never find two trees, keyboard focus must never land in what is leaving, and a test looking for "the tree" must keep finding exactly one.
- **The pedigree winds itself into the fan.** The two views draw the same people under the same Ahnentafel numbers, so every person has a real start and a real destination — which is what makes a morph meaningful there and nowhere else in the app. The family view also draws descendants, and most of its cards have nowhere to travel to.
- The motion is computed in **polar coordinates about the fan's centre**, not in x and y. Straight lines would look like boxes sliding into a circle; moving radius and angle instead makes each path curve outward on its own, and the columns wind up into rings.
- Only the position travels. A rectangle cannot become a wedge, and morphing the shapes would have required a single parameterised geometry — at the cost of the pedigree's portraits and the fan's labels along arcs. During the transition each ancestor is a small marker in their branch colour.
- `prefers-reduced-motion: reduce` skips both the cross-fade and the morph.

**A GEDCOM import creates a new family tree**
- **Settings → Import family tree** reads a GEDCOM file into an entirely new tree. The tree already there is untouched: nothing is matched, merged or overwritten. A picker in the header switches between them, and someone who has never opened a terminal can do the whole thing.
- **One SQLite file per tree, not a `treeId` column.** GEDCOM ids are unique only inside one file — this tree's `I500097` and a cousin's `I500097` are different people. Shared tables would have required either rewritten ids or a filter at some forty query sites, where one forgotten filter silently mixes two families.
- A tree's name lives in a `tree_meta` row **inside the tree**. No central registry to drift out of sync, break, or be lost when a `.db` is copied: listing the trees is a directory read plus one row per file. A database without such a row is named after its file and can be renamed in the UI.
- **The original tree is never moved.** `wedin.db` (`TREEMAPPER_DB`) stays exactly as it is, so every CLI script and the e2e isolation keep working. It cannot be deleted from the UI — the scripts own that file.
- Every request carries `?tree=<id>`, added in one place in `src/lib/api.ts`. A query parameter rather than a header, because the GEDCOM export is a plain download link and links cannot set headers.
- **A broken file creates nothing.** The upload is read and checked before any tree exists: a file with no people is refused with 400, and if the import fails anyway the half-written database is deleted. Uploads over 50 MB are stopped before they are buffered.
- Photos are not downloaded for imported trees — a GEDCOM holds links, not files. New trees show the placeholders that already exist, and the tree list says how many are missing.
- `runImport` moved from `scripts/` to `lib/`: a tree created in the browser and one created in the terminal must be the same thing. `npm run import` is unchanged.

**The consistency bench groups by severity**
- The queue now has a heading per severity (logical error → duplicate → warning → other → minor) instead of one long list, and a severity filter beside the category filter. Because the list is capped at 500 problems, the milder severities were otherwise unreachable — you only ever saw errors and duplicates. The severity is in the heading, so the cards no longer repeat it.
- **Fixed: the filter did not replace the list.** Choosing a warning category left the logical errors sitting on top. The same problem is reported several times when the data holds the same fact several times (one person has four identical "Bosatt" entries after their death), those cards then shared a React key, and React kept old cards on redraw. Problems with the same fingerprint *and* the same owner are now folded into one (7 of 2 826). The owner has to be part of the identity: a duplicate group deliberately shares one fingerprint across its members, and each still needs its own card.
- `setParam` on both the Konsekvens and tree pages now uses the functional form of `setSearchParams`. Two changes in quick succession otherwise read the same snapshot of the URL, and the second wiped the first.

**The person list opens the tree**
- Every search hit now has a **Show in tree** link beside the name, leading to the person in the chart rather than to the person page. Two records can share both name and years — the tree is often the quickest way to see which one you have in front of you.

**Change history on the person page**
- The person page ends with what has changed about that person, most recent first, out of `audit_log`. Narrowing to one person means reading the snapshots, not just the entity ids: an event belongs to its owner, a child link to the child, a family to its spouses, and a merge to the record that survived. A deleted event exists only in the before-image — which is exactly when a log earns its keep.
- **Deletion now asks in the app's own dialog** instead of the browser's `window.confirm`. It names the event, says what deletion means, follows the theme and exists in all four languages. The button that deletes is red; the one that cancels is not.
- **Fixed:** a person who was a child in two families with the same mother got the mother twice in the family box, with duplicate React keys as a result. `getPersonFull` now counts each relative once. It arose precisely from the branches imported more than once.

**Branches imported more than once**
- `npm run merge-duplicates -- <person-id> ...` folds up a branch that exists in several copies: it walks the whole branch, clusters the records that are the same human being, and merges each cluster into the best-evidenced one. Dry run by default, backup before `--apply`.
- Merging two people now also folds together **families that turn out to be the same couple twice** — the children, the marriage and its sources move to the older family. Without that, cleaning a duplicated branch leaves a couple with four marriages and four sets of children.
- `removeChildLink` solves what blocked everything else: an import can place someone as a child in a family they are also married into, and nobody can be their own parent. While that link exists the merge refuses (same lineage).
- The order is not negotiable: **children before parents.** While the copies hang under separate families, two siblings born on the same day are twins and are left alone; once the parents are one person they all sit in the same family and that distinction can no longer be seen.
- Clustering requires an exact birth date plus either the same name or the same partner — the latter catches married names in reversed order. The ambiguous is reported rather than guessed: two records married to the same person *and* sharing children, but with different birth dates, are printed for a human. Sharing children is not signal enough (every married couple does), and sharing a partner is not either (a widow who remarried).
- Dry run against `wedin.db`: 50 merges, 4 561 → 4 511 people, four duplicate families folded, 40 fewer consistency problems.

**Fixed and dismissed**
- The consistency bench now has a collapsed log at the top: the most recent changes to the tree (from `audit_log`) mixed with what has been dismissed, newest first. Changes are described in plain words — "Death for Anders Johan Persson Karlsson: date — → '17 mar 1942'", "Birth removed for …", "Merged Anna Larsson (I3) into …" — by comparing the before and after images field by field, and every line links to the person.
- Nothing ties a change to the problem it solved, and the log does not claim otherwise: problems are computed, so a fixed problem leaves the queue by itself. Dismissed problems get their category and note by looking the fingerprint up against the detection that ran in the same call; if the problem has stopped occurring the line says so instead. The GEDCOM import does not count as work done.
- The log rides along in `/api/issues` rather than getting its own endpoint — otherwise the fingerprint lookup would have cost another full scan of the database.

**Consistency marks in the tree**
- A new **Visa konsekvenser** checkbox in the chart toolbar, shared by all three views and remembered like the flag preference. Off until asked for: it costs a full scan of the database, and most visits to the tree are not about fixing data. The strings exist in all four languages.
- The person panel lists the problems in the consistency bench's own wording, at the bottom of the panel after the notes — a footnote to the person, not what the person is. Repeats of the same category are gathered under one heading with a count: four children born after the same father's death is one fact told four times, not four headings. The setting is module state rather than component state, so the toolbar checkbox fills the panel beside it without a reload.
- **The person page** ends with the same section, without a checkbox: if you have gone to a person, what the queue holds about them belongs with the rest of the record. An edit there clears the register, so a problem you have just fixed stops being reported without a reload — `clearIssueMarks` now tells its listeners rather than merely emptying the cache. The list is extracted into `ProblemList`, shared by the panel and the page.
- The register carries the problems' texts, not just the categories, so the panel needs no query of its own — one scan per person would have cost half a second on every click, and half the tree is marked. Moving `groupProblems` to the client was not cosmetic: `lib/issues.ts` imports `node:crypto`, and a value import from there drags the whole database schema into the browser bundle (`tsc` said nothing; the browser said everything).
- Cards get a badge in the top right corner — the colour is the person's worst severity, the number how many problems they carry. Hovering names the categories and the card's `aria-label` says the same in words. The fan's slices have no corner to put a badge in, so they get a dot in the same colour at the slice's inner corner: the only place free of the name, the flag and the generation band in every ring (the first attempt framed the whole slice in the severity colour, which made the fan look broken rather than annotated).
- Nothing new is detected: `/api/issues/persons` runs the same detectors as the consistency bench and folds them per person, so what you dismissed in the queue stops being marked in the tree. Everyone involved is marked, not only the owner of the queue entry — a child born after the father's death is worth seeing from both cards. The scan takes just over half a second across the whole database, so the charts fetch the register once and share the answer; dismissing or merging empties it.
- Worth knowing: **about half the tree carries at least one problem** (2 335 of 4 561 people), mostly the mass warnings "Death without a date" and "Alive but too old". It is the severity colours that make the view usable — only 160 people have an outright logical error.
- `flagPreference` became `chartPreferences` with a shared `useStoredToggle`, since there are now two settings that behave the same way.

**Light and dark mode**
- A picker in the header: **Follow system / Light / Dark**, remembered between visits and applied before the first paint so the page does not flash light. While the choice is "follow system" the app keeps listening to the OS — switch to night mode and the app follows without a reload. The strings exist in all four languages.
- The charts could not use Tailwind's `dark:` variant, because their colours are SVG fill and stroke set from JavaScript. They are now CSS variables (`--branch-*`, `--card-*`, `--chart-canvas`, `--chart-link`) that `.dark` swaps, applied through `style` — `fill="var(--x)"` does not work as a presentation attribute. The four branch colours keep their identity in both modes: pale tints on a light canvas, deep ones on a dark.
- The flags' colours are deliberately not themed — a Swedish flag is blue and yellow in any mode. An e2e test checks exactly that, while the cards around it do change colour.
- The rest of the interface moved from hardcoded greys to the theme's own tokens (`text-muted-foreground`, `bg-muted`, `text-primary`, `text-destructive`); the colour-coded severities got dark variants that keep their hue.

**Statistics**
- A new page `/statistik` telling the family's story in numbers: lives and lifespans, names, families, and places and work. The whole tree by default, or one person's **own ancestors and descendants** via `?person=` (251 people for Sven-Erik against 4 070 if every family tie were followed — the scoped view would then have been identical to the unscoped one). The scope is a breadth-first walk in JS: 8 ms to load the ties, 0 ms to walk them, against 4.5 seconds for the same question as a recursive CTE.
- Every figure states what it rests on, because empty years are everywhere. Two guards keep data errors out of the story: lifespans over 110 years (three people, at most 118) and spouse age gaps over 50 years (two couples, 61 and 111) are left out — the consistency bench flags those already.
- Birth places group on the first part of the place name, so "Alnö, Västernorrland, Sundsvall, Sverige" sits with a bare "Alnö". Across 1 795 distinct place strings there is no clean rule, so the heading promises "birth places" and not "parishes".
- Every chart shows the same numbers as a table, just as the tree has its list view.
- The person search that was baked into the relation dialog is now a shared component used by both the dialog and the statistics page.

**Theme**
- The shadcn theme `radix-luma` with base colour `olive` (preset `b2bkjK7NVw`) applied: new colour tokens for light and dark, Roboto Slab for body text and Public Sans for headings, and pointer cursors on buttons. The charts' own colours stay outside the theme — the branch colours and the grey canvas are deliberately fixed values, so the trees look as they did.

**The family view colours the branches**
- Ancestors in the family view get the same four branch colours as the pedigree and the fan, computed from the same Ahnentafel numbering — a lone parent is therefore placed by sex, not by position in a list, so the same person gets the same colour in every view (a test compares the two computations). Descendants and partners are left uncoloured: they belong to no grandparent branch.

**The family view unfolds both ways**
- The same unfolding as the pedigree, in two directions: **⌃** above the topmost ancestors opens two more generations of parents, **⌄** below the outermost descendants opens two generations of children, and both flip to the opposite arrow to fold the branch again. The buttons appear only where the family actually continues (`hasMoreAncestors` and `hasMoreDescendants` from the API). A ⌄ under a couple sits below the marriage line, since that is where the children hang. Unfolding happens in place with the same glide, fade and gentle pan as the pedigree — the view pans to the *nearest* new generation, not the outermost, so the card you clicked stays in sight.
- The family tree's cards are numbered by their path through the tree, so a fetched branch is inserted in its place without disturbing the other branches' keys — that is what lets the cards glide rather than be redrawn.

**The pedigree unfolds branch by branch**
- Cards whose parents exist in the database but sit outside the chart get a **▸ button** that unfolds two more generations **in place**: the rest of the chart stays put and the zoom is kept, so you follow a single line further back instead of doubling the whole diagram. The button then becomes a **‹** that folds the branch again — taking whatever was opened inside it. The button appears only where the family actually continues, so it also shows where there is more to fetch. Unfolded branches keep their Ahnentafel numbering and therefore their branch colour. The chart pans exactly as far as needed for the newly opened branch to be visible. With a keyboard: the right arrow stops at the button on its way to the parents, Enter unfolds and folds.
- Gentle animation when a branch unfolds or folds: because the rows are recomputed, the cards already on screen glide to their new places, the new ones fade in, the folded ones fade out, and the chart pans smoothly if the branch would otherwise have opened off screen. All of it is off under `prefers-reduced-motion`, and the pan stops the moment you grab the chart so dragging does not lag.

**Languages**
- The interface is available in **Swedish, English, German and Spanish**. A language picker in the header, remembered between visits, which also sets `<html lang>`. Swedish is the source language and the fallback for keys missing from a translation (a test checks that all four dictionaries have identical key sets). The translation covers the interface, GEDCOM event names, date formatting (month names and ABT/BEF/AFT) and the born/died abbreviations. Record content — names, places, notes — stays as entered, and the consistency categories and descriptions remain Swedish (the page says so when another language is chosen).

**Tree (UI round 2026-08-07)**
- Two new views: **Antavla** (a classic left-to-right pedigree) and **Fan chart** (a circular chart), both ancestors only, up to 8 generations. The four grandparent branches are coloured separately, positions are computed from the Ahnentafel numbering so a missing ancestor leaves an empty place rather than shifting the rest, and in the fan the text on the lower and left halves is flipped so nothing reads upside down. The view choice is stored in the URL (`?vy=`), and every chart shares zoom, person panel, portraits, flags and keyboard model.
- Person panel: clicking (or Enter) on a card opens a panel with portrait, dates, family and events. Re-focusing the tree is now its own button in the panel rather than something that happens on every click, and the relatives in the panel can be clicked to read on without the chart moving. Escape closes.
- Partners are shown in the tree: people whose descendants are drawn get their spouse beside them with a marriage line between, and the children hang from the line rather than from one parent. Children from a second marriage hang from the right couple. Partner cards are reachable by keyboard and appear in the list view.
- Country flags on the cards, drawn as SVG, with a "Visa flaggor" checkbox in the toolbar (remembered between visits). The flag appears only when the birth place explicitly names a country — a parish with no country is therefore not assumed to be Swedish. Christening counts as a birth place when the birth place is missing; residence and death do not, since they can point at a different country than the one the person was born in.
- Portraits on the cards: the person's primary photo (or first downloaded) as a round image, with initials as a fallback so every card keeps the same shape.

**Phases 1–6**
- Phase 6 (Sources + export): a source list with search and citation counts, a source page with editable fields (audit-logged) and every citation linked to people and events, cross-linking from the person page's citations; GEDCOM 5.5.1 export that round-trips `raw_tags` — verified both by unit tests through our own parser and by exporting and re-importing the whole real tree with identical results in every table; `/api/export/gedcom`, `npm run export` and a settings page with a download button.
- Phase 5 (the consistency bench): 28 deterministic detectors calibrated against MyHeritage's own consistency checker (894 problems in 24 categories) plus four completeness categories; a review queue worst-first with a category filter, Fix/Dismiss and dismissals remembered through stable fingerprints; duplicate merging with a side-by-side comparison, a full audit snapshot and transactional safety; a scoreboard on Home. New endpoints `/api/issues` and `/api/merge`.
- Phase 4 (Editing): in-place editing of person fields, events (add/edit/delete) and relations (child/partner/parent through guided dialogs) on the person page; shared zod schemas (`lib/schemas.ts`); transactional mutations with full before/after snapshots in `audit_log`; Swedish error messages for impossible states (self-relation, lineage cycle, third parent, duplicate child); fuzzy dates always accepted (a warning rather than a rejection); e2e runs against a copy of the database so real family data is never mutated.
- Phase 3 (Tree): an interactive SVG chart (SVG + d3-hierarchy for the layout maths only, an ownership decision over WebGL) — ancestors up and descendants down, 1–5 generations, pan and zoom, arrow-key navigation between relatives, an equivalent list view, `/api/tree/:id`, cycle protection in the data, and support for pedigree collapse (the same person twice in the chart).
- Phase 2 (Browse): a searchable person list (name/birth year/birth place, also finding married names, paginated), a readable person page (photos, family box with clickable relations, event timeline with citations, notes), Hem with the search box at its centre, a Swedish i18n dictionary, `/api/persons`, `/api/persons/:id/full`, `/api/media/:id`, and a Playwright e2e for the browse flow.
- Phase 1: repository skeleton, SQLite schema, GEDCOM import CLI, photo download CLI, stats API and app shell.
- Fault-tolerant GEDCOM parsing: 2 331 broken lines in the real export are recovered as note continuations and listed in the import report instead of crashing the import.
- `npm run refresh-media` — reloads dead signed CDN links from a fresh MyHeritage export.

### Changed

**The family tree is in the address**
- Every page is now `/<tree>/<page>`: `/wedin/personer?q=jens+wedin`, `/andersson/person/I500001`. **A link means one thing.**
- Previously the tree lived only in the browser, so `/person/I500001` showed whichever tree the picker happened to be on — the same address was Sven-Erik in one tree and someone else entirely in another. A bookmark rotted as soon as you looked at something else, and a link you sent showed the reader a different person than you meant.
- The original tree is called `wedin` rather than `default`. The id comes from the database's filename, never from the display name, so renaming a tree cannot break a link that already exists. `default` still works as an alias.
- Ids the router needs for itself (`personer`, `trad`, `kalla` …) are reserved — `/personer` has to mean the People page.
- An address with no tree (`/personer`) gets one put in front; an address with a *deleted* tree gets its own swapped out. Prefixing instead of swapping would have given `/wedin/grannslakten/personer`, which is no page at all.
- The export link says which tree it is for: `?tree=wedin`. What you downloaded is not a guess.

**The header stays still**
- Every page now has **the same width**, and the header spans the window whatever tab you are on. The width used to follow each page's content — tables wider than body text — which meant the navigation itself moved when you changed tab.
- The tree is the exception and gets the whole window. The header having its own width is precisely what lets it be so without anything above moving.
- An e2e test measures the position and width of the navigation and the content on every tab and compares them — that sort of thing otherwise slides back unnoticed.

**The zoom glides towards its target**
- The wheel moves a **target**, and a loop continuously closes the distance to it. Stopping scrolling therefore *is* the tail — the distance finishes closing — so gesture and afterglow are a single curve.
- It replaces a first version that waited 80 ms for the gesture to end and then started its own coast. Measured frame by frame, the chart stood still for 87 ms and set off again at a fifth of the speed; that stop-and-start was what felt wobbly.
- The distance closes in logarithmic space: scale is multiplicative, so zooming out has to glide exactly as zooming in rather than sticking at the small end.

**Calmer zoom in the tree**
- The wheel now zooms **in proportion to how far you actually scroll**. A fixed factor per event is what made the trackpad wild: two fingers produce a stream of small events, and each one previously counted as much as a whole wheel click. A nudge zooms a little, a sweep zooms a lot, and no single event may take more than 10 %.
- Lines and pages are converted to pixels (`deltaMode`), and a trackpad pinch — which arrives as ctrl+wheel — is allowed to be faster, since it is a deliberate gesture.
- **The zoom buttons glide** rather than jump. The wheel and dragging do not: a transition would always sit one event behind the finger.

**The person panel slides in**
- The panel fades and slides in from the right, and **stays put while sliding out** rather than blinking away. The latter requires the person it was showing to be kept for a moment after the selection is released — `useLingering` does exactly that, and does nothing at all when `prefers-reduced-motion` is set.
- Only the panel moves; the chart takes its new width at once. Animating the width would have recomputed the chart's fit every frame, which both stutters and is pointless — the eye follows the panel, not the gap.

**The selected card is visible**
- The chosen card gets a **halo that strikes and then breathes** — slowly and shallowly, 2.8 seconds per breath. The attack hands over at the exact moment it lands on the resting state, so the two read as one motion. The fan's slice does the same with its outline. `prefers-reduced-motion: reduce` gives the halo without the motion, since the resting state is also the animation's starting point.
- **Fixed: the person panel pushed the heading and tabs off screen.** The switcher was missing `min-w-0`, so the flex row refused to shrink and the page scrolled sideways when the panel opened.

**The tree page makes room for the tree**
- The focus person's **name is the link** to their page. A separate "Open person page" beside it said the same thing twice and put the useful thing last.
- The views are **tabs** rather than buttons, with real `tablist`/`tab` semantics: a single tab stop, arrow keys between the tabs, and the panel pointed at with `aria-controls`. Hand-written rather than an off-the-shelf component, because the panel is the animated switcher and has to stay mounted through a tab change for the transition to happen at all.
- **The zoom sits in the chart's own bottom right corner** rather than in a toolbar above. Controls belong to the surface they affect.
- **Generations and card settings live behind a cog** that opens a popover. What met you first on the page was otherwise a row of controls rather than the family. The generation choices stay in the URL, so a link still carries them.
- The text about the arrow keys is gone from the screen but **remains for screen readers** — it is still the target of the chart's `aria-describedby`, and keyboard help is exactly what is needed by someone who cannot see the chart.

- The charts sit on a soft grey canvas rather than white, so the cards read as cards, and the card under the pointer is lifted with a soft shadow. SVG has no box-shadow, so the shadow is a `filter` — which makes it follow the fan's wedges as well as the rectangular cards. The family lines were darkened a step so as not to lose readability against the grey.
- The tree no longer blinks when you change person or depth: the page emptied the chart before fetching the next one, so the view went blank and was then fitted afresh. The old chart now stays until the new one has arrived (and a response that gets overtaken is discarded).
- The pedigree no longer reserves room for branches that are missing entirely. The grid was always 2^generations rows tall, so a sparse line spread out over a nearly empty chart — eleven cards ended up at 28 % zoom. An unknown parent now costs an empty row (so a lone mother stays under her missing husband rather than sliding up into his place), while a branch that is gone altogether costs nothing: the same eleven cards now show at 82 %.
- The pedigree and fan show 1–5 generations rather than 1–8. Eight generations shrank the chart to a few per cent — beyond five you follow one line at a time with the ▸ button instead.
- Narrower cards in the tree (150×106 rather than 210×66): the portrait sits at the top and centred, given name and surname on their own centred lines, the years below. More people fit across and fewer names need truncating.
- The page width follows the content: the tree chart takes the whole window (pinned to the window height, no page scroll), table pages (people, sources, consistency) got wider room for their columns, and body text keeps a readable line length. The tree's toolbar shrank from three rows to two.

### Fixed

**A test run wrote to the real database**
- A source titled "Test" appeared in `wedin.db` during a Playwright run. The copy under `.e2e/` was taken at 19:47 and does not contain the row; `wedin.db` gained it at 19:49 — in the middle of the run. The record has been removed and the count is back to 520.
- The API now answers `/api/health` with the database file it is actually serving, and the suite has a test requiring that to be under `.e2e/`. Vite additionally refuses to start an e2e run pointed at the development server's port. A browser test that quietly reaches the development API edits the family's real records, and the only trace is a row nobody put there.

**220 duplicate event rows removed from wedin.db**
- Leftovers from merges made before the engine stopped writing the same fact twice: 149 groups where one row repeated another exactly, across 58 people. RESI 76, OCCU 48, BIRT 39, DEAT 37, EVEN 9, BURI 6, MARR 3, CHR 1, EMIG 1.
- "Exactly" means every column but the id — owner, type, date, year, place, description, age and raw GEDCOM tags. Two births with *different* dates are two sources contradicting each other and are left alone.
- The lowest id is kept, so the row that has been there longest survives. Every removal is in the change log with a full before-image and which row it duplicated.
- Verified: 4 511 people, 979 families, 5 804 citations and 979 photos unchanged. The number of **distinct** facts is the same before and after (14 363) — only repetitions went. Nobody lost all their events.

**Every tree has its own photo folder**
- The original tree kept its photos loose in `media/` while imported trees got subfolders. That asymmetry was a trap rather than a convenience: media ids are per-database integers, so every tree owns a media 1 — and the tree whose photographs cannot be replaced was the one sitting where a collision would land.
- 985 files moved to `media/wedin/` with `mv`, not a copy: the same filesystem, so each file moves in one step and 423 MB of photographs never exists in duplicate or half-written. Names and sizes verified before and after.
- **Fixed: an uploaded photo recorded the wrong path.** `addPhoto` wrote the file to the tree's folder but always saved `media/<id>` in `local_path` — a path that does not exist for any tree but the first. Display hid the fault (it reads only the filename), but that string is what the GEDCOM export writes as its FILE line.

**The photo download can be pointed at a tree**
- `npm run media -- andersson` fetches an imported tree's photos. The script previously always opened `wedin.db` and wrote to `media/`, whichever tree was meant.
- Each tree downloads into its own folder. Media ids are per-database integers, so every tree owns a media 1 — one shared folder would have let the second tree silently overwrite the first's photographs.
- 257 photos fetched for Andersson, 0 failed. The main tree's 985 files untouched.

**Merging no longer records the same fact twice**
- Two records of one person usually carry the same information — that similarity is exactly what made them look like duplicates. The events were moved across unexamined, so the survivor stood born twice on the same day. It is also the origin of the duplicated event rows in `wedin.db`.
- A fact the survivor already has, word for word (type, date, place, description), is not written again; the summary counts them as `droppedEvents`. Two births with *different* dates are both kept — that is two sources disagreeing, and it is the researcher's to settle, not the merge's.

**Search did not find people with middle names**
- `jens wedin` gave 0 hits in the Wedin tree even though you are in it — as *Karl Johan Fredrik Lindqvist*. The search matched the whole phrase as one string, and the middle names sit in the gap between the two words you type. Most people in the database have middle names, so the search quietly hid the very person being looked for, and answered 0 as confidently as it answers 5.
- The result counter says `1 träff` and `2 träffar`. It always wrote the plural form, the same thing as "1 källor" before.
- Each word is now matched separately: every word must hit (AND), each against given name, surname or married name (OR). `jens wedin` finds *Karl Johan Fredrik Lindqvist*, `sven erik wedin` finds *Sven-Erik Wedin*, and `jens larsson` still gives 0 — it is a filter, not a guess.

- **e2e read a stale snapshot.** The setup copied `wedin.db` but not its `-wal`, where the newest writes live in WAL mode. The suite therefore tested against data missing everything recently corrected. With the `-wal` included, three tests failed that rested on data since cleaned up — a duplicate of Anders Bergqvist that has been merged, and the category "Dubbla mellanslag i namnet" that has been emptied. They now find their own test data instead of naming records that can disappear.

- `fetchJson` now throws `ApiError` with a status code. The person and source pages compared the error message against the string `'HTTP 404'` to tell "does not exist" from "something broke" — a contract that broke silently as soon as the message was improved, which the e2e suite caught.
- The name field in the tree list got an accessible name of its own. It otherwise shared its accessible name with the import form's name field on the same page, which makes them impossible to tell apart with a screen reader.

- Cards collided in the family view: a partner card could sit 121 px inside the next sibling. Partner cards sit to the right of their person, so it is the *left* card that needs the extra width — but d3 makes no promise about which of the separation function's two arguments is the left one (it passes (node, previous sibling) when siblings are placed and (left, right) when subtree contours are compared). The width is now taken from whichever of the two is wider. Checked against 250 real trees: zero overlaps.
- The GEDCOM export lost the text on 3 519 citations. The parser lifts `TEXT` out of `DATA` and puts `DATA`'s other children (usually a `DATE`) in `raw_tags`; the export then wrote them as **two separate `DATA` nodes**, and on reading the last one won — the one without text. The text is now put back in the `DATA` it came from. Also: a stray carriage return left inside a note was never written out by the export and therefore could not come back — it is now cleaned away at read time. After this the round trip is exact: **all seven tables identical** when the whole real tree is exported and read back (4 561 people, 983 families, 14 588 events, 5 804 citations, 985 media). The parser now also keeps the first `TEXT` if a program splits `DATA` across several nodes, so the same trap cannot spring from elsewhere.
- Citation lines were glued into one mess: "Sven-Erik WedinKön: ManHemvist: Sundsvall". MyHeritage never writes `CONT` — all 10 190 continuations in the export are `CONC`, which by the standard means "join with no separator", including where a new line was meant. A writer only needs to continue a line when it is full, so a `CONC` after a line that never reached the limit is now read as the line break it was meant to be, while genuine length splits are still joined. The limit counts **bytes**: "ö" costs two, so a full line can be 196 characters — measured in characters, breaks landed inside words (in the middle of an escaped `<br>`, for instance). `npm run repair-conc` fixed the existing database without re-importing (which would have thrown away hand-made edits): 1 108 fields got their line breaks back, and the script touches only fields where the sole difference is where the lines break, skipping anything present in `audit_log`.
- Notes and citations are shown as readable text rather than raw HTML. MyHeritage stores them as HTML — 469 of 478 source notes contain tags — and much of it is escaped as well, often twice over (`&amp;lt;br&amp;gt;`), so Swedish letters appeared as `&auml;` mid-sentence. The text is now decoded until it settles, `<br>` and paragraph tags become line and paragraph breaks, and the remaining tags are stripped. Checked against all 6 493 notes in the real tree: no tags, no entities, and no note left empty. Note that only known tag names are removed — `<Privat>`, which MyHeritage uses for living people, stays (present in 20 citations). Nothing is rewritten in the database: the edit boxes show the original and the GEDCOM export is still lossless.
- The generation selector no longer bounces back: the page clamped `upp` to a different ceiling than the dropdown offered. Both now use the same list. The fan's outer rings additionally shrink the text size and drop years and flags where the slices get too thin — that overlap cannot be zoomed away.
- The tree's zoom is now absolute: 100 % means cards at real size however wide the tree is (previously the whole tree was scaled to fit first, so wide generations could not be zoomed to a readable size). Zoom range 4–300 %, the view fits the tree on load, +/− work from the focus person, and arrow-key navigation pans so the active card is visible.
- The GEDCOM flag `Y` (as in `1 DEAT Y`, "the event happened") is no longer shown as description text on the person page or in the tree panel. The value stays in the database so the export remains lossless.
- New person ids no longer start from MyHeritage's placeholder record `I88888888` ("Unassociated photos") — they continue the real numbering.
- Merging from the interface works: zod 4's `z.record()` with an enum key requires every key and therefore rejected empty field choices.

### Security

**A tree id is not a path**
- **Critical, fixed:** `DELETE /api/trees/..%2Fwedin` answered `200 OK` and deleted `wedin.db` together with its `-wal` and `-shm` — the whole family database. The guard "the original tree cannot be deleted" only compared against the string `default`, and `../wedin` is not that string. The same route via `?tree=` opened and migrated arbitrary `.db` files, and `mediaDirFor` deleted directories recursively outside `media/`.
- Ids are now validated against `^[a-z0-9][a-z0-9-]{0,63}$` in `fileFor` and `mediaDirFor` — the only places where an id becomes a path — so every caller is covered. Slugification could never produce anything else; everything else did not come from us.
- A regression test runs ten variants (`../wedin`, `..%2F..%2Fetc/passwd`, `a/../../b`, empty string, null byte …) through both `openTree` and `deleteTree`, and checks explicitly that the family database is still there.
- Photos are served with `X-Content-Type-Options: nosniff`: an uploaded file is trusted only as far as the type the browser claimed for it.
- The import's temporary file is created with `mkdtemp` rather than a name built from the clock — a predictable path in a shared `/tmp` is one another process can sit on beforehand.

### Data

- Real import completed: 4 561 people, 983 families, 520 sources, 14 588 events, 5 804 citations.
- All 985 photos recovered (2026-08-06) via a fresh MyHeritage export + `refresh-media` + `media` → 985/985 downloaded, 0 failures (425 MB, gitignored).
- **Andersson deduplicated (2026-08-09…11): 504 → 486 people, 0 duplicate findings.** One branch imported twice, showing at three levels: Jens himself, his grandparents (invisible to the detector because one copy said "Anders Andersson" and the other "Anders Bertil Andersson"), and six Bergqvist children recorded under both of Anders Bergqvist's wives. The last were assigned by arithmetic: Karin was 6 years old in 1719, Elisabet died in 1733. No citation or photo lost — 483 and 257 before and after.
