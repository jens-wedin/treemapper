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
  it('grupperar på den första delen av ortsträngen', () => {
    expect(placeKey('Alnö, Västernorrland, Sundsvall, Sverige')).toBe('Alnö');
    expect(placeKey('Bjuråker')).toBe('Bjuråker');
    expect(placeKey('  Hassela , X ')).toBe('Hassela');
  });
});

describe('getPlaces', () => {
  it('rangordnar födelseorter efter första delen', () => {
    person('a'); person('b'); person('c');
    event('a', 'BIRT', 'Alnö, Västernorrland, Sverige');
    event('b', 'BIRT', 'Alnö');
    event('c', 'BIRT', 'Bjuråker');
    const r = getPlaces(db, null);
    expect(r.birthPlaces).toEqual([{ place: 'Alnö', count: 2 }, { place: 'Bjuråker', count: 1 }]);
    expect(r.withBirthPlace).toBe(3);
  });

  it('räknar länder som ISO-koder, precis som flaggorna i trädet', () => {
    person('a'); person('b');
    event('a', 'BIRT', 'Alnö, Västernorrland, Sverige');
    event('b', 'BIRT', 'Oslo, Norge');
    const r = getPlaces(db, null);
    expect(r.countries).toEqual([{ place: 'NO', count: 1 }, { place: 'SE', count: 1 }]);
  });

  it('räknar inte en socken utan land som ett land', () => {
    person('a');
    event('a', 'BIRT', 'Bjuråker');
    expect(getPlaces(db, null).countries).toEqual([]);
  });

  it('rangordnar yrken', () => {
    person('a'); person('b');
    event('a', 'OCCU', undefined, 'Bonde');
    event('b', 'OCCU', undefined, 'bonde');       // samma yrke, annan skiftläge
    const r = getPlaces(db, null);
    expect(r.occupations).toEqual([{ place: 'Bonde', count: 2 }]);
  });

  it('listar in- och utvandring, nyast först', () => {
    person('a'); person('b');
    event('a', 'EMIG', 'Amerika', undefined, 1890);
    event('b', 'IMMI', 'Sverige', undefined, 1910);
    const r = getPlaces(db, null);
    expect(r.migrations.map(m => [m.id, m.type, m.year])).toEqual([['b', 'IMMI', 1910], ['a', 'EMIG', 1890]]);
  });

  it('räknar bara med personerna i avgränsningen', () => {
    person('inne'); person('ute');
    event('inne', 'BIRT', 'Alnö');
    event('ute', 'BIRT', 'Alnö');
    expect(getPlaces(db, new Set(['inne'])).birthPlaces).toEqual([{ place: 'Alnö', count: 1 }]);
  });

  it('klarar en tom databas', () => {
    const r = getPlaces(db, null);
    expect(r.birthPlaces).toEqual([]);
    expect(r.migrations).toEqual([]);
    expect(r.withBirthPlace).toBe(0);
  });
});
