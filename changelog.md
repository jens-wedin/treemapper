# Changelog

## [Unreleased]

### Added
- Phase 1: repo scaffold, SQLite schema, GEDCOM import CLI, photo download CLI, stats API + app shell.
- Fault-tolerant GEDCOM parsing: 2 331 malformed lines in the real export are recovered as note continuations and listed in the import report instead of crashing the import.
- `npm run refresh-media` — re-arms dead signed CDN URLs from a fresh MyHeritage export (the July 2026 export's links expired; all 985 downloads return HTTP 403).
- Real import completed: 4 561 personer, 983 familjer, 520 källor, 14 588 händelser, 5 804 källhänvisningar, 985 foton (pending/failed until a fresh export exists).
