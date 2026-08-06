import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media } from '../db/schema';
import { exportGedcom } from './gedcomExport';
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

const roundTrip = (): MappedData => mapGedcom(parseGedcom(exportGedcom(db)));

describe('exportGedcom — struktur', () => {
  it('skriver ett giltigt GEDCOM-skelett', () => {
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

  it('skriver FAMC/FAMS så att andra program ser relationerna', () => {
    buildTree();
    const lines = exportGedcom(db).split('\r\n');
    expect(lines).toContain('1 FAMS @F1@');   // I1 är make
    expect(lines).toContain('1 FAMC @F1@');   // I3 är barn
  });
});

describe('exportGedcom — rundtur genom vår egen parser', () => {
  it('bevarar antal och nyckelvärden', () => {
    buildTree();
    const back = roundTrip();

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

  it('bevarar raw_tags på person, händelse och media', () => {
    buildTree();
    const back = roundTrip();
    expect(back.persons.find(p => p.id === 'I1')!.rawTags).toContain('_UID');
    expect(back.events.find(e => e.type === 'BIRT')!.rawTags).toContain('Testgatan 1');
    expect(back.media[0]!.rawTags).toContain('MH:P1');
  });

  it('återskapar EVEN med TYPE', () => {
    buildTree();
    const back = roundTrip();
    const even = back.events.find(e => e.type === 'EVEN')!;
    expect(even.description).toBe('Militärtjänst: Var med i kriget');
  });

  it('överlever långa värden och radbrytningar', () => {
    const long = 'Lorem ipsum dolor sit amet '.repeat(30).trim();   // ~800 tecken
    db.insert(persons).values({
      id: 'I1', givenName: 'Lång', surname: 'Text', sex: 'U',
      note: `${long}\nandra raden`, rawTags: null,
    }).run();
    const back = roundTrip();
    expect(back.persons[0]!.note).toBe(`${long}\nandra raden`);
  });

  it('överlever inbäddade CR (Windows-radbrytningar i importerad text)', () => {
    // Riktig data innehåller \r\n inuti värden — de får inte läcka ut i filen
    db.insert(sources).values({
      id: 'S1', title: 'Testkälla',
      note: '<p>Data från anarkiv</p>\r\n<p>Andra stycket</p>',
      author: null, publication: null, rawTags: null,
    }).run();
    const text = exportGedcom(db);
    const bad = text.split('\r\n').filter(l => l.includes('\r'));
    expect(bad).toEqual([]);   // ingen rad får innehålla ett löst CR
    const back = roundTrip();
    expect(back.sources[0]!.note).toBe('<p>Data från anarkiv</p>\n<p>Andra stycket</p>');
  });

  it('klarar en tom databas', () => {
    const text = exportGedcom(db);
    expect(text).toContain('0 HEAD');
    expect(text.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(roundTrip().persons).toHaveLength(0);
  });
});
