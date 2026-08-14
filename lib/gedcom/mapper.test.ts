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

  /**
   * NOTE and TEXT say different things: NOTE is the researcher's remark about
   * the source, TEXT is what the source itself says. TEXT used to fall back
   * into `note`, which filled 478 sources with MyHeritage's own blurbs and left
   * nowhere to write a remark of your own.
   */
  it('keeps the source\'s own text apart from a note about it', () => {
    expect(mapped.sources[0]).toMatchObject({
      id: 'S1', title: 'Kyrkbok Hälsingland', author: 'Svenska kyrkan',
      transcription: 'Beskrivning av källan',
      note: null,
    });
    // consumed into its column, so the export writes one TEXT and not two
    expect(mapped.sources[0].rawTags ?? '').not.toContain('Beskrivning');
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

  it('keeps the text even when a second DATA follows with no TEXT', () => {
    // Ett par program delar upp DATA i flera noder. Sist-vinner gjorde att den
    // an empty one used to blank the text — the same trap our own export fell into.
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

  it('normalises a 7.0 media type on FORM back to a bare extension', () => {
    const tree = parseGedcom([
      '0 HEAD', '0 @I1@ INDI', '1 OBJE', '2 FILE https://x/y.jpg',
      '2 FORM image/jpeg', '0 TRLR',
    ].join('\n'));
    const { media } = mapGedcom(tree);
    expect(media[0]!.form).toBe('jpg');
  });

  it('reads 7.0 multimedia: a pointer + a top-level OBJE record → a media row', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME Test /Person/', '1 OBJE @M5@',
      // TITL nests under FILE in 7.0 — the grammar forbids it as a direct
      // child of the record (FamilySearch's g7validation rejects that shape).
      '0 @M5@ OBJE', '1 FILE https://x/y.jpg', '2 FORM image/jpeg', '2 TITL Ett foto', '1 _FILESIZE 4242',
      '0 TRLR',
    ].join('\n'));
    const { media, warnings } = mapGedcom(tree);
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ ownerId: 'I1', originalUrl: 'https://x/y.jpg', form: 'jpg', title: 'Ett foto', filesize: 4242 });
    expect(warnings.some(w => /Skipped unknown level-0 record OBJE/.test(w))).toBe(false);
    expect(warnings.some(w => /not referenced by any INDI/.test(w))).toBe(false);
  });

  /**
   * A resolved 7.0 multimedia record whose FILE is missing or not http
   * (e.g. a local-only path from a desktop program) must not vanish, and it
   * must not dangle on re-export either. Its data (TITL/_FILESIZE/…) now
   * lives in raw_records as the `0 @M9@ OBJE` record itself; the person keeps
   * only the bare `1 OBJE @M9@` pointer, which is exactly what a 7.0 file
   * requires — a pointer line may not carry the record's children.
   */
  it('preserves a resolved-but-unusable OBJE record as a raw_record, keeping only the bare pointer on the person', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME Test /Person/', '1 OBJE @M9@',
      '0 @M9@ OBJE', '1 FILE C:\\Photos\\album.jpg', '2 FORM image/jpeg', '1 TITL Familjealbum', '1 _FILESIZE 999',
      '0 TRLR',
    ].join('\n'));
    const { persons, media, rawRecords } = mapGedcom(tree);
    expect(media).toHaveLength(0);   // no usable http FILE, so no media row
    const p1 = persons.find(p => p.id === 'I1')!;
    expect(p1.rawTags).toContain('"tag":"OBJE"');
    expect(p1.rawTags).toContain('"value":"@M9@"');
    expect(p1.rawTags).not.toContain('Familjealbum');   // the record's data moved to rawRecords, not the person
    expect(p1.rawTags).not.toContain('999');
    const objeRecord = rawRecords.find(r => r.tag === 'OBJE' && r.xref === 'M9');
    expect(objeRecord).toBeDefined();
    expect(objeRecord!.rawTags).toContain('Familjealbum');
    expect(objeRecord!.rawTags).toContain('999');
  });

  it('preserves a level-0 OBJE record that no INDI points to, instead of warning it away', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME Test /Person/',
      '0 @M7@ OBJE', '1 FILE https://x/orphan.jpg', '2 FORM image/jpeg',
      '0 TRLR',
    ].join('\n'));
    const { media, rawRecords, warnings } = mapGedcom(tree);
    expect(media).toHaveLength(0);
    const objeRecord = rawRecords.find(r => r.tag === 'OBJE' && r.xref === 'M7');
    expect(objeRecord).toBeDefined();
    expect(objeRecord!.rawTags).toContain('https://x/orphan.jpg');
    expect(warnings.some(w => /not referenced by any INDI/.test(w))).toBe(false);
  });

  /**
   * The scenario maximal70.ged actually hits: an OBJE record whose FILE is a
   * LOCAL (non-http) path. It must round-trip through rawRecords with no
   * dangling pointer — the person's `1 OBJE @O1@` resolves to a preserved
   * `0 @O1@ OBJE` record, not to nothing.
   */
  it('round-trips a local-file OBJE record via rawRecords with no dangling pointer', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME Test /Person/', '1 OBJE @O1@',
      '0 @O1@ OBJE', '1 FILE some/local.jpg', '2 FORM image/jpeg',
      '0 TRLR',
    ].join('\n'));
    const mapped = mapGedcom(tree);
    expect(mapped.media).toHaveLength(0);
    const p1 = mapped.persons.find(p => p.id === 'I1')!;
    expect(p1.rawTags).toContain('"tag":"OBJE"');
    expect(p1.rawTags).toContain('"value":"@O1@"');
    const objeRecord = mapped.rawRecords.find(r => r.tag === 'OBJE' && r.xref === 'O1');
    expect(objeRecord).toBeDefined();
    expect(objeRecord!.rawTags).toContain('some/local.jpg');
  });

  /**
   * maximal70.ged has an OBJE record referenced 5 times — by an INDI and
   * several nested `2 OBJE @O2@` pointers elsewhere. Turning it into a media
   * row would re-export it under a new `@M{id}@` xref, leaving every other
   * reference to the original xref dangling. A record referenced exactly
   * once has no such problem and must still become media.
   */
  it('keeps a shared OBJE record (referenced by more than one pointer) out of media, but maps a singly-referenced one', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME First /Person/', '1 OBJE @S1@',
      '0 @I2@ INDI', '1 NAME Second /Person/', '1 OBJE @S1@',
      '0 @I3@ INDI', '1 NAME Third /Person/', '1 OBJE @M1@',
      '0 @S1@ OBJE', '1 FILE https://x/shared.jpg', '2 FORM image/jpeg',
      '0 @M1@ OBJE', '1 FILE https://x/solo.jpg', '2 FORM image/jpeg',
      '0 TRLR',
    ].join('\n'));
    const { media, rawRecords } = mapGedcom(tree);

    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ ownerId: 'I3', originalUrl: 'https://x/solo.jpg' });

    const shared = rawRecords.find(r => r.tag === 'OBJE' && r.xref === 'S1');
    expect(shared).toBeDefined();
    expect(shared!.rawTags).toContain('https://x/shared.jpg');
    const solo = rawRecords.find(r => r.tag === 'OBJE' && r.xref === 'M1');
    expect(solo).toBeUndefined();   // the singly-referenced record became media, not a raw_record
  });

  it('captures HEAD.SCHMA tag→URI and does not treat NO as an event', () => {
    const tree = parseGedcom([
      '0 HEAD', '1 SCHMA', '2 TAG _LOC http://example.com/loc',
      '0 @I1@ INDI', '1 NAME A /B/', '1 NO MARR', '2 DATE FROM 1900 TO 1950',
      '0 TRLR',
    ].join('\n'));
    const out = mapGedcom(tree);
    expect(out.schema).toMatchObject({ _LOC: 'http://example.com/loc' });
    expect(out.events.some(e => e.type === 'NO')).toBe(false);                 // NO is not an event
    expect(out.persons[0]!.rawTags).toContain('NO');                           // NO preserved in raw
  });

  it('preserves a foreign level-0 record (SNOTE, SUBM) verbatim in rawRecords', () => {
    const tree = parseGedcom([
      '0 HEAD',
      '0 @I1@ INDI', '1 NAME A /B/', '1 SNOTE @N1@',
      '0 @N1@ SNOTE A shared note', '1 LANG en',
      '0 @U1@ SUBM', '1 NAME The submitter',
      '0 TRLR',
    ].join('\n'));
    const { rawRecords } = mapGedcom(tree);
    const snote = rawRecords.find(r => r.tag === 'SNOTE');
    expect(snote).toMatchObject({ xref: 'N1', tag: 'SNOTE' });
    expect(snote!.rawTags).toContain('LANG');                 // children preserved
    expect(rawRecords.find(r => r.tag === 'SUBM')?.xref).toBe('U1');
    expect(mapGedcom(tree).warnings.some(w => /Skipped unknown level-0/.test(w))).toBe(false);
  });
});
