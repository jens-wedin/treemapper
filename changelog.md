# Changelog

## [Unreleased]

### Added

**Språk**
- Gränssnittet finns nu på **svenska, engelska, tyska och spanska**. Språkväljare i sidhuvudet, valet minns mellan besök och sätter även `<html lang>`. Svenska är källspråk och reserv för nycklar som saknas i en översättning (ett test kontrollerar att alla fyra ordlistor har samma nyckeluppsättning). Översättningen omfattar gränssnittet, GEDCOM-händelsernas namn, datumformatering (månadsnamn och ABT/BEF/AFT) och förkortningarna för född/död. Personuppgifter — namn, platser, anteckningar — står kvar som de är registrerade, och konsekvensproblemens kategorier och beskrivningar är kvar på svenska (sidan säger till när ett annat språk är valt).

**Träd (UI-omgång 2026-08-07)**
- Två nya vyer: **Antavla** (klassisk vänster-till-höger-tavla) och **Solfjäder** (cirkulärt diagram), båda med enbart förfäder i upp till 8 generationer. De fyra mor-/farföräldragrenarna färgas var för sig, platserna räknas ut från anfarsnumreringen så att en saknad förfader lämnar en tom plats i stället för att förskjuta resten, och i solfjädern vänds text på nedre och vänstra halvan så att inget står upp och ned. Vyval sparas i URL:en (`?vy=`), och alla diagram delar zoom, personpanel, porträtt, flaggor och tangentbordsmodell.
- Personpanel: klick (eller Enter) på ett kort öppnar en panel med porträtt, datum, familj och händelser. Att fokusera om trädet är nu en egen knapp i panelen i stället för något som händer vid varje klick, och släktingarna i panelen går att klicka på för att läsa vidare utan att diagrammet flyttar sig. Escape stänger.
- Partner visas i trädet: personer vars ättlingar ritas ut får sin make/maka bredvid sig med ett vigselstreck emellan, och barnen hänger från strecket i stället för från ena föräldern. Barn från ett andra äktenskap hänger från rätt par. Partnerkorten nås med tangentbordet och finns med i listvyn.
- Landsflaggor på korten, ritade som SVG, med kryssrutan "Visa flaggor" i verktygsraden (valet sparas mellan besök). Flaggan visas bara när födelseplatsen uttryckligen namnger ett land — en socken utan land antas alltså inte vara svensk. Dop räknas som födelseort när födelseplats saknas; bosättning och död gör det inte, eftersom de kan peka på ett annat land än personen föddes i.
- Porträtt på korten: personens primära foto (eller första nedladdade) som rund bild, med initialer som reserv så att alla kort behåller samma form.

**Faserna 1–6**
- Fas 6 (Källor + export): källista med sökning och antal hänvisningar, källsida med redigerbara fält (auditloggade) och alla hänvisningar länkade till personer och händelser, korslänkning från personsidans källhänvisningar; GEDCOM 5.5.1-export som round-trippar `raw_tags` — verifierad både med enhetstester genom vår egen parser och genom att exportera och återimportera hela det riktiga trädet med identiskt resultat i samtliga tabeller; `/api/export/gedcom`, `npm run export` och en inställningssida med nedladdningsknapp.
- Fas 5 (Konsekvensbänken): 28 deterministiska detektorer kalibrerade mot MyHeritages egen konsekvenskontroll (894 problem i 24 kategorier) plus fyra kompletthetskategorier; granskningskö värst först med kategorifilter, Åtgärda/Avfärda och avfärdanden som minns via stabila fingeravtryck; sammanslagning av dubbletter med jämförelse sida vid sida, fullständig audit-snapshot och transaktionellt skydd; resultattavla på Hem. Nya endpoints `/api/issues` och `/api/merge`.
- Fas 4 (Redigering): redigering på plats av personfält, händelser (lägg till/redigera/ta bort) och relationer (barn/partner/förälder via guidade dialoger) på Personsidan; delade zod-scheman (`lib/schemas.ts`); transaktionella mutationer med fullständiga before/after-snapshots i `audit_log`; svenska felmeddelanden för omöjliga tillstånd (självrelation, släktlinjecykel, tredje förälder, dubbelt barn); luddiga datum accepteras alltid (varning i stället för avvisning); e2e körs mot en kopia av databasen så att riktig familjedata aldrig muteras.
- Fas 3 (Träd): interaktivt SVG-diagram (SVG + d3-hierarchy enbart för layoutmatematik, ägarbeslut framför WebGL) — förfäder uppåt/ättlingar nedåt 1–5 generationer, panorering och zoom, piltangentsnavigering mellan släktingar, likvärdig listvy, `/api/tree/:id`, cykelskydd i datat och stöd för anförlust (samma person två gånger i diagrammet).
- Fas 2 (Browse): sökbar personlista (namn/födelseår/födelseort, hittar även på giftasnamn, paginerad), läsbar Personsida (foton, familjeruta med klickbara relationer, händelsetidslinje med källhänvisningar, anteckningar), Hem med sökrutan i centrum, svensk i18n-ordlista, `/api/persons`, `/api/persons/:id/full`, `/api/media/:id`, Playwright-e2e för browse-flödet.
- Fas 1: repo-skelett, SQLite-schema, GEDCOM-import-CLI, fotonedladdnings-CLI, stats-API och appskal.
- Feltolerant GEDCOM-tolkning: 2 331 trasiga rader i den riktiga exporten räddas som notfortsättningar och listas i importrapporten i stället för att krascha importen.
- `npm run refresh-media` — laddar om döda signerade CDN-länkar från en färsk MyHeritage-export.

### Changed
- Smalare kort i trädet (150×106 i stället för 210×66): porträttet ligger överst och centrerat, förnamn och efternamn på var sin centrerade rad, årtalen under. Fler personer får plats i bredd och färre namn behöver kortas.
- Sidbredden följer innehållet: träddiagrammet tar hela fönstret (fäst vid fönsterhöjden, ingen sidscroll), tabellsidor (personer, källor, konsekvens) fick bredare yta för sina kolumner, och löptext behåller läsbar radlängd. Trädets verktygsrad kortades från tre rader till två.

### Fixed
- Antavla och solfjäder tar emot fler än fem generationer: sidan klämde fortfarande `upp` till 5 trots att API:et och rullgardinen höjts till 8, så 6–8 studsade tillbaka. Samtidigt krymper solfjäderns yttre ringar textstorleken och utelämnar årtal och flaggor där skivorna blir för tunna — den överlappningen går inte att zooma bort.
- Trädets zoom är nu absolut: 100 % betyder kort i verklig storlek oavsett hur brett trädet är (tidigare skalades hela trädet in i vyn först, så breda generationer gick inte att zooma till läsbar storlek). Zoomområde 4–300 %, vyn anpassas till trädet vid inladdning, +/− utgår från fokuspersonen och piltangentsnavigering panorerar så att det aktiva kortet syns.
- GEDCOM-flaggan `Y` (som i `1 DEAT Y`, "händelsen har inträffat") visas inte längre som beskrivningstext på personsidan eller i trädpanelen. Värdet finns kvar i databasen så att exporten förblir förlustfri.
- Nya person-id:n utgår inte längre från MyHeritages platshållarpost `I88888888` ("Unassociated photos") — de fortsätter den riktiga numreringen.
- Sammanslagning från gränssnittet fungerar: zod 4:s `z.record()` med enum-nyckel kräver alla nycklar och avvisade därför tomma fältval.

### Data
- Riktig import genomförd: 4 561 personer, 983 familjer, 520 källor, 14 588 händelser, 5 804 källhänvisningar.
- Alla 985 foton räddade (2026-08-06) via färsk MyHeritage-export + `refresh-media` + `media` → 985/985 nedladdade, 0 fel (425 MB, gitignorerat).
