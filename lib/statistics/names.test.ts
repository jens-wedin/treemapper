import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons } from '../../db/schema';
import { getNames, firstGivenName } from './names';

let db: Db;
const add = (id: string, givenName: string, surname: string, sex: 'F' | 'M' | 'U') =>
  db.insert(persons).values({ id, givenName, surname, sex }).run();

beforeEach(() => { db = createDb(':memory:'); });

describe('firstGivenName', () => {
  it('takes only the first given name', () => {
    expect(firstGivenName('Anna Margareta')).toBe('Anna');
    expect(firstGivenName('Anna')).toBe('Anna');
  });

  it('copes with extra whitespace and empty names', () => {
    expect(firstGivenName('  Anna   Margareta ')).toBe('Anna');
    expect(firstGivenName('')).toBe('');
    expect(firstGivenName('   ')).toBe('');
  });
});

describe('getNames', () => {
  it('ranks given names by sex, counting a compound name on its first part', () => {
    add('1', 'Anna Margareta', 'Olsdotter', 'F');
    add('2', 'Anna', 'Persdotter', 'F');
    add('3', 'Brita', 'Olsdotter', 'F');
    add('4', 'Erik Johan', 'Olsson', 'M');
    const r = getNames(db, null);
    expect(r.femaleGiven).toEqual([{ name: 'Anna', count: 2 }, { name: 'Brita', count: 1 }]);
    expect(r.maleGiven).toEqual([{ name: 'Erik', count: 1 }]);
    expect(r.surnames[0]).toEqual({ name: 'Olsdotter', count: 2 });
  });

  it('counts people of unknown sex as neither women nor men', () => {
    add('1', 'Kim', 'Okänd', 'U');
    const r = getNames(db, null);
    expect(r.femaleGiven).toEqual([]);
    expect(r.maleGiven).toEqual([]);
    expect(r.surnames).toEqual([{ name: 'Okänd', count: 1 }]);
  });

  it('skips empty names and states the basis', () => {
    add('1', 'Anna', 'Olsdotter', 'F');
    add('2', '', '', 'F');
    const r = getNames(db, null);
    expect(r.withGivenName).toBe(1);
    expect(r.withSurname).toBe(1);
    expect(r.femaleGiven).toEqual([{ name: 'Anna', count: 1 }]);
  });

  it('takes at most ten names in each list', () => {
    for (let i = 0; i < 15; i++) add(`f${i}`, `Namn${i}`, `Efter${i}`, 'F');
    const r = getNames(db, null);
    expect(r.femaleGiven).toHaveLength(10);
    expect(r.surnames).toHaveLength(10);
  });

  it('counts only the people inside the scope', () => {
    add('inne', 'Anna', 'Olsdotter', 'F');
    add('ute', 'Anna', 'Persdotter', 'F');
    expect(getNames(db, new Set(['inne'])).femaleGiven).toEqual([{ name: 'Anna', count: 1 }]);
  });
});
