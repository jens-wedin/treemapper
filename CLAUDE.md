# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file is the *conventions and traps*. `MEMORY.md` is the current state and
open threads — read it too, and update it when you finish a piece of work.

## What this is

A local-first genealogy web app that replaces MyHeritage for one family. Vite 7
+ React 19 + TypeScript (strict) + Tailwind 4 + shadcn/ui + react-router on the
front; Hono + better-sqlite3 + drizzle-orm on the back; vitest and Playwright
for tests.

**It holds real data about living people.** Roughly a thousand people in
`wedin.db` have no recorded death. Their names, birth dates, places and
photographs are irreplaceable — the MyHeritage export they came from is a
snapshot, and the photo CDN links have since expired. Treat the databases the
way you would treat someone else's only copy, because that is what they are.

## The language rule

**The project is written in English. The data is Swedish.**

English: code, identifiers, comments, test names, routes, query parameters,
`localStorage` keys, element ids, terminal output, commit messages, and every
document in the repo.

Swedish, and to be left alone: person and place names, notes, GEDCOM bodies and
fixtures, the `sv` dictionary, and `Konsekvensbänken` where it appears as the
app's own word for that page. Swedish inside a quoted example (`"Sven-Erik
WedinKön: Man"`, `"Alnö, Västernorrland"`) is data being illustrated — do not
"fix" it.

English is also the **i18n source language**: `src/lib/i18n/dictionaries.ts`
leads with `en`, `Dict = typeof en`, and `sv`/`de`/`es` are `DeepPartial<Dict>`
that fall back to it. A browser with no stored preference opens in English.

## Commands

```bash
npm run dev        # app on :5173, API on :3001
npm test           # vitest
npx vitest run <file>   # prefer this over the whole suite while iterating
npm run test:e2e   # Playwright, against .e2e/ — never the real database
npm run build      # tsc -b && vite build
```

Data tools, all **dry-run by default** — they print what they would do and need
`--apply` to write:

```bash
npm run import                 # GEDCOM → trees/<id>.db
npm run media -- <tree>        # download that tree's photos
npm run export -- [path]       # GEDCOM 5.5.1 out
npx tsx scripts/dedupe-events.ts <tree> [--apply]
```

## Working on the data

1. **Count before and after.** `persons`, `families`, `events`, `sources`,
   `citations`, `media`, `audit_log`. Any drift you did not intend is a defect
   to investigate, not noise to shrug at.
2. **Back up the `.db` with its `-wal` and `-shm`.** Copying only the main file
   captures a stale snapshot; this bit the e2e fixture for months.
3. **Never trust `sqlite3 -readonly` on a WAL database.** With no `-shm` it
   fails and prints *nothing*, which reads exactly like "verified, no rows".
4. **Every mutation writes a before/after snapshot to `audit_log`**, which is
   what makes a repair reversible. Keep it that way.
5. **Show the user candidates before merging anything.** It is his family and
   he has asked to see them.

## Testing

### Write the test first

Default to TDD for anything with a definable answer — a parser, a layout, a
query, a detector, an endpoint. The loop, one behaviour at a time:

```bash
npx vitest run lib/dates.test.ts        # one file, not the suite
npx vitest lib/dates.test.ts            # or watch it
```

1. Write one failing test that names the behaviour, not the implementation.
2. **Run it and read the failure.** It must fail for the reason you intended.
3. Write the smallest code that passes it.
4. Run it again, then the whole file.
5. Commit.

**Step 2 is the one that earns its keep, and the one worth being strict about.**
A test that passes the first time is a finding: either the behaviour already
existed, or the test is not reaching the code. Six storage tests in this repo
passed immediately because the node environment has no `localStorage` and a
defensive `try/catch` handed back the default — green, and testing nothing. If
you did not watch it go red, you do not know what it covers.

Two habits that keep tests honest here:

- **Assert on structure, not on wording.** `expect(issue.code).toBe(
  'death-before-birth')` survives a rewording; `toContain('Barnet är äldst')`
  does not, and three tests had to be rewritten when the detector stopped
  emitting sentences. Where a test does check user-visible text, take the
  expected string from the dictionary rather than retyping it.
- **Name the test as the behaviour**, in English: `it('counts a parent once,
  even when the child sits in two families with the same mother')`. The name is
  the specification; if it only says `it('works')` the test cannot tell you what
  broke.

### Where TDD fits, and where something else does

| Layer | How to drive it |
|---|---|
| `src/lib/*` — layout, ahnentafel, dates, i18n, richText | Pure functions, no I/O. Strict TDD; these are the easiest and highest-value tests in the repo. |
| `lib/*` — queries, detectors, mutations, merge | TDD against `createDb(':memory:')` in `beforeEach`, with small `person()`/`event()`/`family()` helpers. See `lib/issues.test.ts`. |
| `api/*` | TDD through `api.request('/api/…')` on a temp-directory database; see `api/sources.test.ts`. Assert status *and* body. |
| React components | No unit tests here by choice. Cover the behaviour in e2e and keep the logic in `src/lib/` where it can be tested directly. |
| Data-repair scripts | The dry run **is** the test: print what would change, read it, then `--apply`. Add a unit test for any pure helper inside. |
| Anything visual | A screenshot you actually look at. A passing assertion says the element exists, not that it is readable. |

Do not write a test whose only job is to restate the implementation, and do not
retro-fit tests to code you just wrote by copying its output into an assertion —
that locks in whatever it does, including the bugs.

### Then leave the fixtures behind

Fixture tests are necessary and have not been sufficient. **Every genuine bug in
this project was found by running against the real database or by looking at the
running app** — not by a failing test. TDD gets the logic right; it does not
tell you the answer is implausible. So once the suite is green:

- Run the code over `wedin.db` and sanity-check the extremes — the largest, the
  oldest, the counts. Ask "is this figure *possible*?", not "does it match the
  fixture?"
- For anything visual, drive the running app with Playwright, screenshot it, and
  read it. That is what caught a Swedish sentence 546 passing tests were happy
  with.
- For data changes, compare row counts before and after and spot-check the rows
  that moved.

### e2e specifics

- The suite mutates data, so it runs against `.e2e/` (copied by
  `e2e/global-setup.ts`) on ports 5199/3199, `workers: 1` because the specs
  share one SQLite file. `/api/health` reports which database is being served
  and a test asserts it is the copy.
- It takes ~2 minutes, so it is a verification step rather than a TDD loop. Run
  one spec while iterating: `npx playwright test e2e/sources.spec.ts`.
- Playwright `.check()`/`.uncheck()` fight React checkboxes driven by URL state.
  Use `.click()` then `toBeChecked()`.
- A stray `*.spec.ts` anywhere in the repo gets picked up by vitest.
- The node test environment has **no `localStorage`**; `vitest.setup.ts`
  installs a stub.

## Traps this codebase has already sprung

- **A defensive `try/catch` can make a test pass without testing anything.**
  Storage reads were wrapped in one, the test environment had no
  `localStorage`, and the catch returned the default. Six tests, zero coverage.
  When a test passes first time on code you expected to fail, find out why.
- **An untyped `Map` turns everything read from it into `any`.**
  `new Map(cond ? entries : [])` widened to `Map<any, any>` and hid a field that
  no longer existed. Give a `Map` its type arguments.
- **A glob needs the filename to end in the pattern.** `*.db` does not match
  `wedin.db.before-merge`, which is how 27 MB of family data got committed.
  Verify ignore rules by listing what is *tracked*, not by reading the patterns.
- **Drizzle raw SQL**: an interpolated `${persons.id}` inside a `sql` fragment
  renders unqualified and binds to the wrong table in a correlated subquery.
  Write the qualifier literally.
- **zod 4** `z.record(z.enum(...), v)` requires *every* enum key. Use
  `z.object({...}).partial()`.
- **`1 DEAT Y`** — the `Y` is a GEDCOM flag, not text. Filter it from display
  with `eventDescription()`; keep it stored so export stays lossless.
- **`I88888888`** is a MyHeritage placeholder, not a person.
- **A `<label>` wrapping a `<select>`** takes the chosen option into its
  accessible name. Use `htmlFor` + `id`.
- **The i18n key-parity test does not catch a key in the wrong namespace** — it
  checks the dictionaries against each other, not against where `t()` looks.

## Architecture worth knowing before you change it

- **One SQLite file per tree, all in `trees/`.** GEDCOM xrefs are only unique
  within a file, so this tree's `I500097` and a cousin's are different people.
  `trees/wedin.db` is the default tree, `trees/<id>.db` the rest, `media/<id>/`
  per tree. `TREEMAPPER_DB` overrides the default's path. Because the default
  now sits inside the scanned directory, `listTrees` skips its file so it is
  listed once — as the default — not again as an imported tree.
- **A tree's id comes from its filename, never its display name**, so renaming
  cannot break a saved link. `default` remains an alias.
- **The tree is in every URL** (`/wedin/people`), read during render rather than
  in an effect — a page fetches on mount, and an effect would run after that
  fetch had gone out under the previous tree. `src/lib/treeUrl.ts` is the module
  every link goes through; read it before touching routing.
- **The server never composes a sentence.** `lib/issues.ts` reports a code plus
  the values behind it and `src/lib/issueText.ts` builds the wording;
  `lib/issueLog.ts` does the same for the change history. That is what makes
  them translatable. `role` resolves to both `{role}` and `{roleOwner}` because
  Swedish wants a possessive where English wants a preposition.
- **Dismissals are keyed by a fingerprint that hashes the issue code.** Changing
  how a fingerprint is built orphans them; check `issue_dismissals` is empty
  first, or write a migration.

## Accessibility

Not optional here. Semantic HTML, real labels tied with `htmlFor`/`id`, ARIA
only where HTML cannot say it, and keyboard paths that work — the charts are
navigable by arrow keys and the expand buttons are stops on that path.
`<html lang>` is set before first paint so a screen reader reads Swedish content
in a Swedish voice. Check contrast in both themes.

## Finishing a piece of work

- Conventional commits, English, explaining **why** rather than restating the
  diff.
- Update `changelog.md` (one `## [Unreleased]` section; entries describe the app
  as it will ship), `README.md` if behaviour changed, and `MEMORY.md` with
  anything the next session would otherwise have to rediscover.
- Report honestly: if something is unverified, say so; if you left part of the
  scope out, say which part and why.
