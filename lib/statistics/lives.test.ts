import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../../db/client';
import { persons, events } from '../../db/schema';
import { getLives, MAX_PLAUSIBLE_AGE } from './lives';

let db: Db;

function person(id: string, sex: 'F' | 'M' | 'U', birth: number | null, death: number | null) {
  db.insert(persons).values({ id, givenName: id, surname: 'X', sex }).run();
  if (birth !== null) db.insert(events).values({ ownerType: 'person', ownerId: id, type: 'BIRT', dateYear: birth }).run();
  if (death !== null) db.insert(events).values({ ownerType: 'person', ownerId: id, type: 'DEAT', dateYear: death }).run();
}

beforeEach(() => { db = createDb(':memory:'); });

describe('getLives', () => {
  it('räknar personer och könsfördelning', () => {
    person('a', 'F', 1800, 1880);
    person('b', 'M', 1810, 1860);
    person('c', 'U', null, null);
    const r = getLives(db, null);
    expect(r.total).toBe(3);
    expect(r.bySex).toEqual({ F: 1, M: 1, U: 1 });
  });

  it('anger hur många som har både födelse- och dödsår', () => {
    person('a', 'F', 1800, 1880);
    person('b', 'M', 1810, null);
    expect(getLives(db, null).withBothYears).toBe(1);
  });

  it('rangordnar de längsta liven', () => {
    person('kort', 'M', 1800, 1830);
    person('lång', 'F', 1800, 1890);
    const r = getLives(db, null);
    expect(r.longestLives.map(l => l.id)).toEqual(['lång', 'kort']);
    expect(r.longestLives[0]).toMatchObject({ age: 90, birthYear: 1800, deathYear: 1890 });
  });

  it('utesluter omöjliga åldrar, de är datafel som Konsekvens flaggar', () => {
    person('rimlig', 'F', 1800, 1890);
    person('orimlig', 'M', 1700, 1830);            // 130 år
    const r = getLives(db, null);
    expect(MAX_PLAUSIBLE_AGE).toBe(110);
    expect(r.longestLives.map(l => l.id)).toEqual(['rimlig']);
    expect(r.withBothYears).toBe(1);               // räknas inte heller in i underlaget
  });

  it('ger tidigaste och senaste födelseår', () => {
    person('a', 'F', 1480, 1520);
    person('b', 'M', 1990, null);
    const r = getLives(db, null);
    expect(r.earliestBirthYear).toBe(1480);
    expect(r.latestBirthYear).toBe(1990);
  });

  it('grupperar medellivslängd och födslar per århundrade', () => {
    person('a', 'F', 1801, 1851);                  // 1800-talet, 50 år
    person('b', 'M', 1802, 1872);                  // 1800-talet, 70 år
    person('c', 'F', 1901, 1981);                  // 1900-talet, 80 år
    const r = getLives(db, null);
    expect(r.lifespanByCentury).toEqual([
      { century: 1800, averageAge: 60, people: 2 },
      { century: 1900, averageAge: 80, people: 1 },
    ]);
    expect(r.birthsByCentury).toEqual([
      { century: 1800, births: 2 },
      { century: 1900, births: 1 },
    ]);
  });

  it('räknar bara med personerna i avgränsningen', () => {
    person('inne', 'F', 1800, 1880);
    person('ute', 'M', 1810, 1860);
    const r = getLives(db, new Set(['inne']));
    expect(r.total).toBe(1);
    expect(r.longestLives.map(l => l.id)).toEqual(['inne']);
  });

  it('klarar en tom avgränsning utan att dela med noll', () => {
    person('a', 'F', 1800, 1880);
    const r = getLives(db, new Set<string>());
    expect(r.total).toBe(0);
    expect(r.longestLives).toEqual([]);
    expect(r.lifespanByCentury).toEqual([]);
    expect(r.earliestBirthYear).toBeNull();
  });
});
