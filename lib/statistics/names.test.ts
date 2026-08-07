import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons } from '../../db/schema';
import { getNames, firstGivenName } from './names';

let db: Db;
const add = (id: string, givenName: string, surname: string, sex: 'F' | 'M' | 'U') =>
  db.insert(persons).values({ id, givenName, surname, sex }).run();

beforeEach(() => { db = createDb(':memory:'); });

describe('firstGivenName', () => {
  it('tar bara det första förnamnet', () => {
    expect(firstGivenName('Anna Margareta')).toBe('Anna');
    expect(firstGivenName('Anna')).toBe('Anna');
  });

  it('klarar extra blanksteg och tomma namn', () => {
    expect(firstGivenName('  Anna   Margareta ')).toBe('Anna');
    expect(firstGivenName('')).toBe('');
    expect(firstGivenName('   ')).toBe('');
  });
});

describe('getNames', () => {
  it('rangordnar förnamn per kön och räknar sammansatta namn på det första', () => {
    add('1', 'Anna Margareta', 'Olsdotter', 'F');
    add('2', 'Anna', 'Persdotter', 'F');
    add('3', 'Brita', 'Olsdotter', 'F');
    add('4', 'Erik Johan', 'Olsson', 'M');
    const r = getNames(db, null);
    expect(r.femaleGiven).toEqual([{ name: 'Anna', count: 2 }, { name: 'Brita', count: 1 }]);
    expect(r.maleGiven).toEqual([{ name: 'Erik', count: 1 }]);
    expect(r.surnames[0]).toEqual({ name: 'Olsdotter', count: 2 });
  });

  it('räknar personer med okänt kön varken som kvinnor eller män', () => {
    add('1', 'Kim', 'Okänd', 'U');
    const r = getNames(db, null);
    expect(r.femaleGiven).toEqual([]);
    expect(r.maleGiven).toEqual([]);
    expect(r.surnames).toEqual([{ name: 'Okänd', count: 1 }]);
  });

  it('hoppar över tomma namn och anger underlaget', () => {
    add('1', 'Anna', 'Olsdotter', 'F');
    add('2', '', '', 'F');
    const r = getNames(db, null);
    expect(r.withGivenName).toBe(1);
    expect(r.withSurname).toBe(1);
    expect(r.femaleGiven).toEqual([{ name: 'Anna', count: 1 }]);
  });

  it('tar högst tio namn i varje lista', () => {
    for (let i = 0; i < 15; i++) add(`f${i}`, `Namn${i}`, `Efter${i}`, 'F');
    const r = getNames(db, null);
    expect(r.femaleGiven).toHaveLength(10);
    expect(r.surnames).toHaveLength(10);
  });

  it('räknar bara med personerna i avgränsningen', () => {
    add('inne', 'Anna', 'Olsdotter', 'F');
    add('ute', 'Anna', 'Persdotter', 'F');
    expect(getNames(db, new Set(['inne'])).femaleGiven).toEqual([{ name: 'Anna', count: 1 }]);
  });
});
