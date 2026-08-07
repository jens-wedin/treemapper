# Changelog

## [Unreleased]

### Added
- Landsflaggor på trädets kort, ritade som SVG, med kryssrutan "Visa flaggor" i verktygsraden (valet sparas mellan besök). Flaggan visas bara när födelseplatsen uttryckligen namnger ett land — en socken utan land antas alltså inte vara svensk. Dop räknas som födelseort när födelseplats saknas; bosättning och död gör det inte, eftersom de kan peka på ett annat land än personen föddes i.

### Changed
- Sidbredden följer innehållet: träddiagrammet tar hela fönstret (fäst vid fönsterhöjden, ingen sidscroll), tabellsidor (personer, källor, konsekvens) fick bredare yta för sina kolumner, och löptext behåller läsbar radlängd. Trädets verktygsrad kortades från tre rader till två.

### Fixed
- Trädets zoom är nu absolut: 100 % betyder kort i verklig storlek oavsett hur brett trädet är (tidigare skalades hela trädet in i vyn först, så breda generationer gick inte att zooma till läsbar storlek). Zoomområde 4–300 %, vyn anpassas till trädet vid inladdning, +/- utgår från fokuspersonen och piltangentsnavigering panorerar så att det aktiva kortet syns.

### Added
- Porträtt på trädets kort: personens primära foto (eller första nedladdade) visas som rund bild, med initialer som reserv så att alla kort behåller samma form; namn kortas nu med ellips i stället för hårt avhugget.
- Phase 6 (Källor + export): källista med sökning och antal hänvisningar, källsida med redigerbara fält (auditloggade) och alla hänvisningar länkade till personer och händelser, korslänkning från personsidans källhänvisningar; GEDCOM 5.5.1-export som round-trippar `raw_tags` — verifierad både med enhetstester genom vår egen parser och genom att exportera och återimportera hela det riktiga trädet med identiskt resultat i samtliga tabeller; `/api/export/gedcom`, `npm run export` och en inställningssida med nedladdningsknapp.
- Phase 5 (Konsekvensbänken): 28 deterministiska detektorer kalibrerade mot MyHeritages egen konsekvenskontroll (894 problem i 24 kategorier) plus fyra kompletthetskategorier; granskningskö värst först med kategorifilter, Åtgärda/Avfärda och avfärdanden som minns via stabila fingeravtryck; sammanslagning av dubbletter med jämförelse sida vid sida, fullständig audit-snapshot och transaktionellt skydd; resultattavla på Hem. Nya endpoints `/api/issues` och `/api/merge`.
- Phase 4 (Redigering): in-place editing of person fields, events (lägg till/redigera/ta bort) and relations (barn/partner/förälder via guidade dialoger) on Personsidan; shared zod-scheman (`lib/schemas.ts`); transaktionella mutationer med fullständiga before/after-snapshots i `audit_log`; svenska felmeddelanden för omöjliga tillstånd (självrelation, släktlinjecykel, tredje förälder, dubbelt barn); luddiga datum accepteras alltid (varning i stället för avvisning); e2e körs mot en kopia av databasen så att riktig familjedata aldrig muteras.
- Phase 3 (Träd): interactive SVG family-tree chart (SVG + d3-hierarchy for layout math only, per owner decision over WebGL) — ancestors up/descendants down 1–5 generations, pan/zoom (hjul, drag, knappar), klick/Enter fokuserar om, piltangentsnavigering mellan släktingar, likvärdig listvy, `/api/tree/:id`, cykelskydd i datat och stöd för anförlust (samma person två gånger i diagrammet).
- Phase 2 (Browse): searchable person list (namn/födelseår/födelseort, married-name aware, paginated), read-only Personsida (foton, familjeruta med klickbara relationer, händelsetidslinje med källhänvisningar, anteckningar), Hem with search front and center, Swedish i18n dictionary, `/api/persons` + `/api/persons/:id/full` + `/api/media/:id`, Playwright e2e for the browse flow.
- Phase 1: repo scaffold, SQLite schema, GEDCOM import CLI, photo download CLI, stats API + app shell.
- Fault-tolerant GEDCOM parsing: 2 331 malformed lines in the real export are recovered as note continuations and listed in the import report instead of crashing the import.
- `npm run refresh-media` — re-arms dead signed CDN URLs from a fresh MyHeritage export (the July 2026 export's links expired; all 985 downloads return HTTP 403).
- Real import completed: 4 561 personer, 983 familjer, 520 källor, 14 588 händelser, 5 804 källhänvisningar.
- All 985 photos rescued (2026-08-06): fresh MyHeritage export + `refresh-media` + `media` → 985/985 downloaded, 0 failures (425 MB, gitignored).
