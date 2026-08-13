import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media } from '../db/schema';
import { exportGedcom, Writer } from './gedcomExport';
import { parseGedcom } from './gedcom/parser';
import { mapGedcom, type MappedData } from './gedcom/mapper';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
});

/** A small but feature-complete tree: names, events, citations, media, raw_tags. */
function buildTree() {
  db.insert(persons).values([
    {
      id: 'I1', givenName: 'Anders', surname: 'Testsson', marriedName: null, suffix: null, sex: 'M',
      note: 'En anteckning\nmed två rader',
      rawTags: JSON.stringify([{ tag: '_UID', value: 'ABC123', children: [] }]),
    },
    { id: 'I2', givenName: 'Eva', surname: 'Provgren', marriedName: 'Testsson', suffix: null, sex: 'F', note: null, rawTags: null },
    { id: 'I3', givenName: 'Barn', surname: 'Testsson', marriedName: null, suffix: null, sex: 'U', note: null, rawTags: null },
  ]).run();
  db.insert(families).values({
    id: 'F1', husbandId: 'I1', wifeId: 'I2', note: 'Familjeanteckning', rawTags: null,
  }).run();
  db.insert(familyChildren).values({ familyId: 'F1', childId: 'I3', seq: 0 }).run();
  db.insert(events).values([
    {
      id: 1, ownerType: 'person', ownerId: 'I1', type: 'BIRT',
      dateRaw: '23 NOV 1845', dateYear: 1845, place: 'Testby, Sverige', description: null, age: null,
      rawTags: JSON.stringify([{ tag: 'ADDR', value: '', children: [{ tag: 'ADR1', value: 'Testgatan 1', children: [] }] }]),
    },
    {
      id: 2, ownerType: 'person', ownerId: 'I1', type: 'EVEN',
      dateRaw: null, dateYear: null, place: null, description: 'Militärtjänst: Var med i kriget', age: null, rawTags: null,
    },
    {
      id: 3, ownerType: 'family', ownerId: 'F1', type: 'MARR',
      dateRaw: '1870', dateYear: 1870, place: 'Testby kyrka', description: null, age: null, rawTags: null,
    },
  ]).run();
  db.insert(sources).values({
    id: 'S1', title: 'Testkälla', author: 'Testförfattare', publication: 'Testförlag',
    note: 'Beskrivning', rawTags: null,
  }).run();
  db.insert(citations).values([
    { id: 1, ownerType: 'event', ownerId: '1', sourceId: 'S1', page: 'Sida 12', quality: 3, text: 'Utdrag ur kyrkbok', rawTags: null },
    { id: 2, ownerType: 'person', ownerId: 'I3', sourceId: 'S1', page: 'Sida 99', quality: null, text: null, rawTags: null },
  ]).run();
  db.insert(media).values({
    id: 1, ownerType: 'person', ownerId: 'I1', title: 'Porträtt',
    originalUrl: 'https://cdn.example.com/a/b/foto.jpg', form: 'jpg', filesize: 12345,
    downloadStatus: 'done', localPath: 'media/1.jpg',
    rawTags: JSON.stringify([{ tag: '_PHOTO_RIN', value: 'MH:P1', children: [] }]),
  }).run();
}

const roundTrip = (version: '5.5.1' | '7.0'): MappedData =>
  mapGedcom(parseGedcom(exportGedcom(db, { version })));

describe('exportGedcom — struktur', () => {
  it('writes a valid GEDCOM skeleton', () => {
    buildTree();
    const text = exportGedcom(db);
    const lines = text.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('0 HEAD');
    expect(lines).toContain('2 VERS 5.5.1');
    expect(lines).toContain('1 CHAR UTF-8');
    expect(lines).toContain('0 @I1@ INDI');
    expect(lines).toContain('1 NAME Anders /Testsson/');
    expect(lines).toContain('2 DATE 23 NOV 1845');
    expect(lines).toContain('0 @F1@ FAM');
    expect(lines).toContain('0 @S1@ SOUR');
    expect(lines.at(-1)).toBe('0 TRLR');
  });

  it('writes FAMC/FAMS so other programs see the relationships', () => {
    buildTree();
    const lines = exportGedcom(db).split('\r\n');
    expect(lines).toContain('1 FAMS @F1@');   // I1 is a spouse
    expect(lines).toContain('1 FAMC @F1@');   // I3 is a child
  });
});

describe('exportGedcom — round trip through our own parser', () => {
  /**
   * A transcription is the reason the field exists, and a page of secretary
   * hand is long and full of line breaks — exactly what GEDCOM's 255-byte
   * lines and CONC/CONT splitting are most likely to mangle.
   */
  it('carries a multi-line transcription all the way out and back', () => {
    buildTree();
    const text = [
      'Pardevant moy soubsigné en présence des tesmoingz cy en bas dénommez',
      'sont comparuz en propres personnes Erik Nilsson maistre marteleur',
      '',
      'demeurant présentement à Hinspont, Andry Falla et Jacques Falla frères',
    ].join('\n');
    db.update(sources).set({ transcription: text }).where(eq(sources.id, 'S1')).run();

    const back = roundTrip('5.5.1');
    const s1 = back.sources.find(s => s.id === 'S1')!;
    expect(s1.transcription).toBe(text);
    // The fixture also carries a note, so this is the case that matters: both
    // present, neither bleeding into the other on the way out or back.
    expect(s1.note).toBe('Beskrivning');
  });

  it('preserves counts and key values', () => {
    buildTree();
    const back = roundTrip('5.5.1');

    expect(back.persons).toHaveLength(3);
    expect(back.families).toHaveLength(1);
    expect(back.sources).toHaveLength(1);
    expect(back.events).toHaveLength(3);
    expect(back.citations).toHaveLength(2);
    expect(back.media).toHaveLength(1);

    const i1 = back.persons.find(p => p.id === 'I1')!;
    expect(i1).toMatchObject({ givenName: 'Anders', surname: 'Testsson', sex: 'M' });
    expect(i1.note).toBe('En anteckning\nmed två rader');
    const i2 = back.persons.find(p => p.id === 'I2')!;
    expect(i2.marriedName).toBe('Testsson');

    const birt = back.events.find(e => e.type === 'BIRT')!;
    expect(birt).toMatchObject({ ownerId: 'I1', dateRaw: '23 NOV 1845', place: 'Testby, Sverige' });

    const fam = back.families[0]!;
    expect(fam).toMatchObject({ id: 'F1', husbandId: 'I1', wifeId: 'I2' });
    expect(back.familyChildren[0]).toMatchObject({ familyId: 'F1', childId: 'I3', seq: 0 });

    expect(back.sources[0]).toMatchObject({ id: 'S1', title: 'Testkälla', author: 'Testförfattare', publication: 'Testförlag' });

    const eventCitation = back.citations.find(c => c.ownerType === 'event')!;
    expect(eventCitation).toMatchObject({ sourceId: 'S1', page: 'Sida 12', quality: 3, text: 'Utdrag ur kyrkbok' });

    expect(back.media[0]).toMatchObject({
      ownerId: 'I1', title: 'Porträtt', form: 'jpg', filesize: 12345,
      originalUrl: 'https://cdn.example.com/a/b/foto.jpg',
    });
  });

  it('preserves raw_tags on person, event and media', () => {
    buildTree();
    const back = roundTrip('5.5.1');
    expect(back.persons.find(p => p.id === 'I1')!.rawTags).toContain('_UID');
    expect(back.events.find(e => e.type === 'BIRT')!.rawTags).toContain('Testgatan 1');
    expect(back.media[0]!.rawTags).toContain('MH:P1');
  });

  it('recreates EVEN with its TYPE', () => {
    buildTree();
    const back = roundTrip('5.5.1');
    const even = back.events.find(e => e.type === 'EVEN')!;
    expect(even.description).toBe('Militärtjänst: Var med i kriget');
  });

  it('survives long values and line breaks', () => {
    const long = 'Lorem ipsum dolor sit amet '.repeat(30).trim();   // ~800 tecken
    db.insert(persons).values({
      id: 'I1', givenName: 'Lång', surname: 'Text', sex: 'U',
      note: `${long}\nandra raden`, rawTags: null,
    }).run();
    const back = roundTrip('5.5.1');
    expect(back.persons[0]!.note).toBe(`${long}\nandra raden`);
  });

  it('survives embedded CR — Windows line breaks in imported text', () => {
    // Real data has \r\n inside values — they must not leak into the file
    db.insert(sources).values({
      id: 'S1', title: 'Testkälla',
      note: '<p>Data från anarkiv</p>\r\n<p>Andra stycket</p>',
      author: null, publication: null, rawTags: null,
    }).run();
    const text = exportGedcom(db);
    const bad = text.split('\r\n').filter(l => l.includes('\r'));
    expect(bad).toEqual([]);   // no line may contain a stray CR
    const back = roundTrip('5.5.1');
    expect(back.sources[0]!.note).toBe('<p>Data från anarkiv</p>\n<p>Andra stycket</p>');
  });

  /**
   * The parser lifts TEXT out of DATA and puts DATA's other children in raw_tags.
   * Written back out as two separate DATA nodes, reading picks up the last
   * one and the text is lost — this hit 3,519 citations in the real
   * tree, every one of them carrying both text and a DATE.
   */
  it('does not lose the text when DATA carries both TEXT and something else', () => {
    db.insert(sources).values({ id: 'S9', title: 'Källa', author: null, publication: null, note: null, rawTags: null }).run();
    db.insert(persons).values({
      id: 'I9', givenName: 'Test', surname: 'Person', marriedName: null, suffix: null, sex: 'U', note: null, rawTags: null,
    }).run();
    db.insert(citations).values({
      ownerType: 'person', ownerId: 'I9', sourceId: 'S9', page: 'sid 4', quality: 3,
      text: 'Tillagd genom bekräftelse av en Smart Match',
      rawTags: JSON.stringify([{ tag: 'DATA', children: [{ tag: 'DATE', value: '26 DEC 2019' }] }]),
    }).run();

    const text = exportGedcom(db);
    // a single DATA under the citation, holding both TEXT and DATE
    const block = text.split('\r\n').slice(text.split('\r\n').findIndex(l => l === '1 SOUR @S9@'));
    const dataLines = block.slice(0, 8).filter(l => /^\d+ DATA$/.test(l));
    expect(dataLines).toHaveLength(1);

    const back = roundTrip('5.5.1');
    const c = back.citations.find(x => x.ownerId === 'I9')!;
    expect(c.text).toBe('Tillagd genom bekräftelse av en Smart Match');
    expect(c.page).toBe('sid 4');
    expect(JSON.parse(c.rawTags!)).toEqual([{ tag: 'DATA', children: [{ tag: 'DATE', value: '26 DEC 2019' }] }]);
  });

  it('copes with an empty database', () => {
    const text = exportGedcom(db);
    expect(text).toContain('0 HEAD');
    expect(text.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(roundTrip('5.5.1').persons).toHaveLength(0);
  });
});

describe.each(['5.5.1', '7.0'] as const)('round-trip through our own parser (%s)', version => {
  it('preserves counts and key values', () => {
    buildTree();
    const out = roundTrip(version);
    expect(out.persons).toHaveLength(3);
    expect(out.families).toHaveLength(1);
    expect(out.sources).toHaveLength(1);
    expect(out.media[0]!.form).toBe('jpg');                       // 7.0 MIME normalised back
    expect(out.persons.find(p => p.id === 'I1')!.rawTags).toContain('_UID');
    expect(out.persons.find(p => p.id === 'I1')!.note).toBe('En anteckning\nmed två rader');
  });
});

describe('exportGedcom — version-aware header', () => {
  it('writes a 7.0 header: VERS 7.0, no CHAR/FORM, SCHMA for extensions', () => {
    buildTree();
    const lines = exportGedcom(db, { version: '7.0' }).replace(/^﻿/, '').split('\r\n');
    expect(lines).toContain('2 VERS 7.0');
    expect(lines).not.toContain('1 CHAR UTF-8');
    expect(lines).not.toContain('2 FORM LINEAGE-LINKED');
    expect(lines).toContain('1 SCHMA');
    expect(lines).toContain('2 TAG _MARNM https://github.com/jens-wedin/treemapper/gedcom/MARNM');
    expect(lines).toContain('2 TAG _UID https://github.com/jens-wedin/treemapper/gedcom/UID');
  });

  it('keeps the 5.5.1 header exactly as before', () => {
    buildTree();
    const lines = exportGedcom(db).replace(/^﻿/, '').split('\r\n');
    expect(lines).toContain('2 VERS 5.5.1');
    expect(lines).toContain('2 FORM LINEAGE-LINKED');
    expect(lines).toContain('1 CHAR UTF-8');
    expect(lines).not.toContain('1 SCHMA');
  });
});

describe('exportGedcom — version-aware media FORM', () => {
  it('7.0 writes an IANA media type on FORM; 5.5.1 keeps the bare extension', () => {
    buildTree();
    expect(exportGedcom(db, { version: '7.0' })).toContain('2 FORM image/jpeg');
    expect(exportGedcom(db)).toContain('2 FORM jpg');
  });
});

describe('Writer — version-aware continuation', () => {
  it('7.0 uses CONT for newlines and never CONC', () => {
    const w = new Writer('7.0');
    w.line(1, 'NOTE', 'a'.repeat(250) + '\nsecond line');
    const lines = w.toString().split('\r\n');
    expect(lines[0]).toBe('1 NOTE ' + 'a'.repeat(250)); // no length split
    expect(lines[1]).toBe('2 CONT second line');
    expect(w.toString()).not.toContain('CONC');
  });

  it('5.5.1 still splits long values with CONC', () => {
    const w = new Writer('5.5.1');
    w.line(1, 'NOTE', 'a'.repeat(250));
    expect(w.toString()).toContain('2 CONC');
  });
});
