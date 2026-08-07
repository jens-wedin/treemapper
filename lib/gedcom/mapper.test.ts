import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGedcom } from './parser';
import { mapGedcom, type MappedData } from './mapper';

let mapped: MappedData;
beforeAll(() => {
  const text = fs.readFileSync(fileURLToPath(new URL('./fixtures/mini.ged', import.meta.url)), 'utf-8');
  mapped = mapGedcom(parseGedcom(text));
});

describe('mapGedcom', () => {
  it('maps persons with names, sex, notes, and placeholder names', () => {
    expect(mapped.persons).toHaveLength(3);
    const [p1, p2, p3] = mapped.persons;
    expect(p1).toMatchObject({ id: 'I1', givenName: 'Sven-Erik', surname: 'Wedin', sex: 'M' });
    expect(p1.note).toBe('En anteckning\nmed två rader');
    // _MARNM sits under NAME (level 2) in the MyHeritage export
    expect(p2).toMatchObject({ id: 'I2', marriedName: 'Wedin', sex: 'F' });
    expect(p3).toMatchObject({ id: 'I3', givenName: '', surname: '', sex: 'U' });
  });

  it('maps events with parsed years, null year for 17xx, and family events', () => {
    const birt = mapped.events.find(e => e.type === 'BIRT');
    expect(birt).toMatchObject({ ownerType: 'person', ownerId: 'I1', dateRaw: '15 APR 1942', dateYear: 1942, place: 'Gävleborgs län, Sverige' });
    const deat = mapped.events.find(e => e.type === 'DEAT');
    expect(deat).toMatchObject({ dateRaw: '17xx', dateYear: null });
    const occu = mapped.events.find(e => e.type === 'OCCU');
    expect(occu).toMatchObject({ description: 'Snickare', dateYear: 1965 });
    const marr = mapped.events.find(e => e.type === 'MARR');
    expect(marr).toMatchObject({ ownerType: 'family', ownerId: 'F1', dateYear: 1964 });
  });

  it('maps families and ordered children', () => {
    expect(mapped.families[0]).toMatchObject({ id: 'F1', husbandId: 'I1', wifeId: 'I2' });
    expect(mapped.familyChildren[0]).toMatchObject({ familyId: 'F1', childId: 'I3', seq: 0 });
  });

  it('maps sources with TEXT as note (kept lossless in raw_tags)', () => {
    expect(mapped.sources[0]).toMatchObject({
      id: 'S1', title: 'Kyrkbok Hälsingland', author: 'Svenska kyrkan', note: 'Beskrivning av källan',
    });
    expect(mapped.sources[0].rawTags).toContain('Beskrivning');
  });

  it('maps citations on events and persons, preserving DATA>DATE in raw_tags', () => {
    const birt = mapped.events.find(e => e.type === 'BIRT')!;
    const eventCit = mapped.citations.find(c => c.ownerType === 'event');
    expect(eventCit).toMatchObject({ ownerId: String(birt.id), sourceId: 'S1', page: 'Sida 12', quality: 3, text: 'Utdrag ur kyrkbok' });
    expect(eventCit!.rawTags).toContain('12 JAN 2020');
    expect(eventCit!.rawTags).not.toContain('Utdrag');
    const personCit = mapped.citations.find(c => c.ownerType === 'person');
    expect(personCit).toMatchObject({ ownerId: 'I3', sourceId: 'S1', page: 'Sida 99' });
  });

  it('håller kvar texten även om en andra DATA följer utan TEXT', () => {
    // Ett par program delar upp DATA i flera noder. Sist-vinner gjorde att den
    // tomma nollställde texten — samma fälla som vår egen export gick i.
    const [rec] = parseGedcom([
      '0 @I9@ INDI',
      '1 SOUR @S1@',
      '2 DATA',
      '3 TEXT Utdrag ur kyrkbok',
      '2 DATA',
      '3 DATE 12 JAN 2020',
    ].join('\n'));
    const cit = mapGedcom([rec!]).citations[0]!;
    expect(cit.text).toBe('Utdrag ur kyrkbok');
    expect(cit.rawTags).toContain('12 JAN 2020');
  });

  it('maps media as pending downloads with _PHOTO_RIN preserved in raw_tags', () => {
    expect(mapped.media).toHaveLength(1);
    expect(mapped.media[0]).toMatchObject({
      ownerType: 'person', ownerId: 'I1', originalUrl: 'https://example.com/photo1.jpg',
      form: 'jpg', title: 'Porträtt', filesize: 12345, downloadStatus: 'pending',
    });
    expect(mapped.media[0].rawTags).toContain('MH:P1');
  });

  it('preserves unmodeled tags in raw_tags and counts albums', () => {
    const p1 = mapped.persons[0];
    expect(p1.rawTags).toContain('_UPD');
    expect(mapped.albums).toBe(1);
  });
});
