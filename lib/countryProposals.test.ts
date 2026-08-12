import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { auditLog, events, families, persons, placeCountryRejections } from '../db/schema';
import { countryProposals, applyCountry, rejectCountry } from './countryProposals';

let db: Db;
let nextEventId = 0;

beforeEach(() => {
  db = createDb(':memory:');
  nextEventId = 0;
  db.insert(persons).values({ id: 'I1', givenName: 'Test', surname: 'Person' }).run();
});

function place(text: string, times = 1) {
  for (let i = 0; i < times; i++) {
    db.insert(events).values({
      id: ++nextEventId, ownerType: 'person', ownerId: 'I1', type: 'RESI', place: text,
    }).run();
  }
}

function event(ownerId: string, text: string) {
  db.insert(events).values({
    id: ++nextEventId, ownerType: 'person', ownerId, type: 'RESI', place: text,
  }).run();
}

const placesNow = () => db.select().from(events).all().map(e => e.place);

describe('countryProposals, who to go and ask', () => {
  it('names the person whose event carries the place', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    const { learned } = countryProposals(db);
    expect(learned[0]!.items[0]!.owners).toEqual([{ id: 'I1', name: 'Test Person' }]);
  });

  it('names every person a place turns up on, without repeating one', () => {
    db.insert(persons).values({ id: 'I2', givenName: 'Anna', surname: 'Ek' }).run();
    place('Bjuråker, Sverige');
    place('Bjuråker', 2);                       // twice on I1
    event('I2', 'Bjuråker');

    const owners = countryProposals(db).learned[0]!.items[0]!.owners;
    expect(owners.map(o => o.id).sort()).toEqual(['I1', 'I2']);
  });

  it('reaches a person through a family event, since a marriage has no page', () => {
    db.insert(persons).values({ id: 'H1', givenName: 'Erik', surname: 'Ek' }).run();
    db.insert(families).values({ id: 'F1', husbandId: 'H1', wifeId: null }).run();
    place('Bjuråker, Sverige');
    db.insert(events).values({
      id: ++nextEventId, ownerType: 'family', ownerId: 'F1', type: 'MARR', place: 'Bjuråker',
    }).run();

    const owners = countryProposals(db).learned[0]!.items[0]!.owners;
    expect(owners).toEqual([{ id: 'H1', name: 'Erik Ek' }]);
  });

  it('lists a few and counts the rest, rather than a wall of names', () => {
    place('Bjuråker, Sverige');
    for (let i = 2; i <= 8; i++) {
      db.insert(persons).values({ id: `I${i}`, givenName: `P${i}`, surname: 'Test' }).run();
      event(`I${i}`, 'Bjuråker');
    }

    const item = countryProposals(db).learned[0]!.items[0]!;
    expect(item.owners).toHaveLength(3);
    expect(item.moreOwners).toBe(4);
  });

  it('names the person on a quarantined place too', () => {
    place('Härnösand, Sverige');
    place('Härnösands nya kyrkogård');

    expect(countryProposals(db).quarantined[0]!.owners)
      .toEqual([{ id: 'I1', name: 'Test Person' }]);
  });

  it('names the person on a place that already stated its country', () => {
    place('Tobyn, Manskog, Varmland, Sweden.');
    expect(countryProposals(db).stated[0]!.owners)
      .toEqual([{ id: 'I1', name: 'Test Person' }]);
  });
});

describe('countryProposals, the learned groups', () => {
  it('groups the places that share one piece of evidence', () => {
    place('Bjuråker, Sverige', 3);
    place('Bjuråker');
    place('Bjuråker Strömbacka');

    const { learned } = countryProposals(db);
    expect(learned).toHaveLength(1);
    expect(learned[0]).toMatchObject({ code: 'SE', by: 'bjuråker', weight: 3, places: 2, rows: 2 });
  });

  it('counts every event carrying the place, not only the distinct spelling', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker', 4);

    const { learned } = countryProposals(db);
    expect(learned[0]).toMatchObject({ places: 1, rows: 4 });
  });

  it('ranks the groups by how many events they would change', () => {
    place('Bjuråker, Sverige');
    place('Voxna, Sverige');
    place('Bjuråker');
    place('Voxna', 5);

    const { learned } = countryProposals(db);
    expect(learned.map(g => g.by)).toEqual(['voxna', 'bjuråker']);
  });

  it('says nothing about a place that already names its country', () => {
    place('Bjuråker, Sverige', 2);
    expect(countryProposals(db).learned).toHaveLength(0);
  });
});

describe('countryProposals, the quarantine', () => {
  it('keeps an edit-distance match out of the batches', () => {
    place('Härnösand, Sverige');
    place('Härnösands nya kyrkogård');

    const { learned, quarantined } = countryProposals(db);
    expect(learned).toHaveLength(0);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({
      place: 'Härnösands nya kyrkogård', code: 'SE', by: 'härnösand', matched: 'Härnösands',
    });
  });
});

describe('countryProposals, what the record already says', () => {
  it('offers to move a country the export stranded mid-string', () => {
    place('Frisbo 17, Bjuråker, Sweden, Gävleborgs, Hälsingland');

    const { stated } = countryProposals(db);
    expect(stated).toHaveLength(1);
    expect(stated[0]).toMatchObject({
      place: 'Frisbo 17, Bjuråker, Sweden, Gävleborgs, Hälsingland',
      code: 'SE',
      after: 'Frisbo 17, Bjuråker, Gävleborgs, Hälsingland, Sverige',
    });
  });

  it('offers to spell a country that is last but unreadable', () => {
    place('Tobyn, Manskog, Varmland, Sweden.');
    expect(countryProposals(db).stated[0]!.after).toBe('Tobyn, Manskog, Varmland, Sverige');
  });

  it('offers to lift a country out of the last words of a segment', () => {
    place('Kalmar Sverige');
    expect(countryProposals(db).stated[0]!.after).toBe('Kalmar, Sverige');
  });

  it('leaves a bracketed country exactly as written', () => {
    // Unpacking `Strömbacka (Bjuråker, Sverige)` means deciding the bracket
    // holds parent jurisdictions rather than a note, and the data does not say.
    place('Strömbacka (Bjuråker, Sverige)');
    expect(countryProposals(db).stated).toHaveLength(0);
  });

  it('takes the whole segment when a bracket only restates the country', () => {
    // Real, nine times over: `Sweden (Sverige)`. Removing just the word leaves
    // a stray `(Sverige)` segment behind.
    place('Stövernäs 1, Skellefteå, Västerbottens län, Sweden (Sverige)');
    expect(countryProposals(db).stated[0]!.after)
      .toBe('Stövernäs 1, Skellefteå, Västerbottens län, Sverige');
  });

  it('keeps a bracketed note when the country beside it goes', () => {
    // `United States   (Bonde)` — the bracket is an occupation, not a restated
    // country, and taking the segment whole would delete it.
    place('Opstead, Mille Lacs, Minnesota, United States   (Bonde)');
    expect(countryProposals(db).stated[0]!.after)
      .toBe('Opstead, Mille Lacs, Minnesota, (Bonde), USA');
  });

  it('moves a country that was written first instead of last', () => {
    place('Sverige, Ånimskog');
    expect(countryProposals(db).stated[0]!.after).toBe('Ånimskog, Sverige');
  });

  it('collapses a country repeated in two segments into one', () => {
    // Real, and it does not end in the country, which is why nothing could
    // read it: the export wrote Sverige twice and a province last.
    place('Halvarsnäs, Glava Glasbruk, Värmland, Sverige, Glava, Sverige, Värmland');
    expect(countryProposals(db).stated[0]!.after)
      .toBe('Halvarsnäs, Glava Glasbruk, Värmland, Glava, Värmland, Sverige');
  });

  it('refuses a place that names two different countries', () => {
    // Two places concatenated by the export. A person has to split them.
    place('Sundsvall, Sweden, Brooklyn, Kings, USA');
    expect(countryProposals(db).stated).toHaveLength(0);
  });

  it('proposes nothing when the country is already last and readable', () => {
    place('Bjuråker, Gävleborg, Sverige');
    expect(countryProposals(db).stated).toHaveLength(0);
  });
});

describe('applyCountry', () => {
  it('appends the Swedish name to every event carrying that place', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker', 3);

    applyCountry(db, 'Bjuråker', 'SE');
    expect(placesNow().filter(p => p === 'Bjuråker, Sverige')).toHaveLength(4);
  });

  it('writes the country in Swedish however the reader has set their language', () => {
    place('Berlin, Tyskland');
    place('Berlin Mitte');

    applyCountry(db, 'Berlin Mitte', 'DE');
    expect(placesNow()).toContain('Berlin Mitte, Tyskland');
  });

  it('rewrites rather than appends when the record already said it', () => {
    place('Tobyn, Manskog, Varmland, Sweden.');
    applyCountry(db, 'Tobyn, Manskog, Varmland, Sweden.', 'SE');
    expect(placesNow()).toEqual(['Tobyn, Manskog, Varmland, Sverige']);
  });

  it('records a before and after for every row it changes', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker', 2);

    applyCountry(db, 'Bjuråker', 'SE');
    const log = db.select().from(auditLog).all();
    expect(log).toHaveLength(2);
    expect(JSON.parse(log[0]!.before!).place).toBe('Bjuråker');
    expect(JSON.parse(log[0]!.after!).place).toBe('Bjuråker, Sverige');
  });

  it('never adds or removes an event', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker', 3);
    const before = db.select().from(events).all().length;

    applyCountry(db, 'Bjuråker', 'SE');
    expect(db.select().from(events).all().length).toBe(before);
  });

  it('does nothing the second time, so a double click cannot double the country', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    applyCountry(db, 'Bjuråker', 'SE');
    applyCountry(db, 'Bjuråker', 'SE');
    expect(placesNow().filter(p => p === 'Bjuråker, Sverige, Sverige')).toHaveLength(0);
  });
});

describe('rejectCountry', () => {
  it('keeps a turned-down inference from coming back', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    expect(countryProposals(db).learned).toHaveLength(1);
    rejectCountry(db, ['Bjuråker'], 'SE');
    expect(countryProposals(db).learned).toHaveLength(0);
  });

  it('turns down only the country that was rejected', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    rejectCountry(db, ['Bjuråker'], 'NO');
    expect(countryProposals(db).learned).toHaveLength(1);
  });

  it('survives being rejected twice', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');

    rejectCountry(db, ['Bjuråker'], 'SE');
    rejectCountry(db, ['Bjuråker'], 'SE');
    expect(db.select().from(placeCountryRejections).all()).toHaveLength(1);
  });

  it('rejects every place in a group at once', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');
    place('Bjuråker Strömbacka');

    rejectCountry(db, ['Bjuråker', 'Bjuråker Strömbacka'], 'SE');
    expect(countryProposals(db).learned).toHaveLength(0);
  });
});

describe('countryProposals leaves the rest alone', () => {
  it('says nothing about a place with no evidence anywhere', () => {
    place('Bjuråker, Sverige');
    place('Ouagadougou');

    const { learned, quarantined, stated } = countryProposals(db);
    expect([...learned, ...quarantined, ...stated]).toHaveLength(0);
  });

  it('ignores an event with no place at all', () => {
    db.insert(events).values({
      id: ++nextEventId, ownerType: 'person', ownerId: 'I1', type: 'BIRT', place: null,
    }).run();
    expect(countryProposals(db).learned).toHaveLength(0);
  });
});

describe('applyCountry does not touch other trees of data', () => {
  it('changes only the events whose place matches exactly', () => {
    place('Bjuråker, Sverige');
    place('Bjuråker');
    place('Bjuråkers kyrka');

    applyCountry(db, 'Bjuråker', 'SE');
    const untouched = db.select().from(events)
      .where(eq(events.place, 'Bjuråkers kyrka')).all();
    expect(untouched).toHaveLength(1);
  });
});
