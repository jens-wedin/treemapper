import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons, events } from '../../db/schema';
import { getPlaces, placeKey } from './places';

let db: Db;
const person = (id: string) => db.insert(persons).values({ id, givenName: id, surname: 'X', sex: 'U' }).run();
const event = (ownerId: string, type: string, place?: string, description?: string, dateYear?: number) =>
  db.insert(events).values({ ownerType: 'person', ownerId, type, place, description, dateYear }).run();

beforeEach(() => { db = createDb(':memory:'); });

describe('placeKey', () => {
  it('groups on the first part of the place string', () => {
    expect(placeKey('Alnö, Västernorrland, Sundsvall, Sverige')).toBe('Alnö');
    expect(placeKey('Bjuråker')).toBe('Bjuråker');
    expect(placeKey('  Hassela , X ')).toBe('Hassela');
  });
});

describe('getPlaces', () => {
  it('ranks birthplaces by their first part', () => {
    person('a'); person('b'); person('c');
    event('a', 'BIRT', 'Alnö, Västernorrland, Sverige');
    event('b', 'BIRT', 'Alnö');
    event('c', 'BIRT', 'Bjuråker');
    const r = getPlaces(db, null);
    expect(r.birthPlaces).toEqual([{ place: 'Alnö', count: 2 }, { place: 'Bjuråker', count: 1 }]);
    expect(r.withBirthPlace).toBe(3);
  });

  it('counts countries as ISO codes, as the flags in the tree do', () => {
    person('a'); person('b');
    event('a', 'BIRT', 'Alnö, Västernorrland, Sverige');
    event('b', 'BIRT', 'Oslo, Norge');
    const r = getPlaces(db, null);
    expect(r.countries).toEqual([{ place: 'NO', count: 1 }, { place: 'SE', count: 1 }]);
  });

  it('does not count a parish with no country as a country', () => {
    person('a');
    event('a', 'BIRT', 'Bjuråker');
    expect(getPlaces(db, null).countries).toEqual([]);
  });

  it('rangordnar yrken', () => {
    person('a'); person('b');
    event('a', 'OCCU', undefined, 'Bonde');
    event('b', 'OCCU', undefined, 'bonde');       // the same occupation in a different case
    const r = getPlaces(db, null);
    expect(r.occupations).toEqual([{ place: 'Bonde', count: 2 }]);
  });

  it('lists immigration and emigration, newest first', () => {
    person('a'); person('b');
    event('a', 'EMIG', 'Amerika', undefined, 1890);
    event('b', 'IMMI', 'Sverige', undefined, 1910);
    const r = getPlaces(db, null);
    expect(r.migrations.map(m => [m.id, m.type, m.year])).toEqual([['b', 'IMMI', 1910], ['a', 'EMIG', 1890]]);
  });

  it('counts only the people inside the scope', () => {
    person('inne'); person('ute');
    event('inne', 'BIRT', 'Alnö');
    event('ute', 'BIRT', 'Alnö');
    expect(getPlaces(db, new Set(['inne'])).birthPlaces).toEqual([{ place: 'Alnö', count: 1 }]);
  });

  it('copes with an empty database', () => {
    const r = getPlaces(db, null);
    expect(r.birthPlaces).toEqual([]);
    expect(r.migrations).toEqual([]);
    expect(r.withBirthPlace).toBe(0);
  });
});
