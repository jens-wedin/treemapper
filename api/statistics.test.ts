import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events } from '../db/schema';
import { createStatisticsApi } from './statistics';
import { fixedTree } from './trees';

let db: Db;
let api: ReturnType<typeof createStatisticsApi>;

beforeEach(() => {
  db = createDb(':memory:');
  db.insert(persons).values([
    { id: 'mor', givenName: 'Anna', surname: 'Olsdotter', sex: 'F' },
    { id: 'jag', givenName: 'Erik', surname: 'Olsson', sex: 'M' },
    { id: 'utom', givenName: 'Karin', surname: 'Fjärran', sex: 'F' },
  ]).run();
  db.insert(families).values({ id: 'F1', husbandId: null, wifeId: 'mor' }).run();
  db.insert(familyChildren).values({ familyId: 'F1', childId: 'jag', seq: 0 }).run();
  db.insert(events).values([
    { ownerType: 'person', ownerId: 'mor', type: 'BIRT', dateYear: 1800 },
    { ownerType: 'person', ownerId: 'jag', type: 'BIRT', dateYear: 1830 },
    { ownerType: 'person', ownerId: 'utom', type: 'BIRT', dateYear: 1840 },
  ]).run();
  api = createStatisticsApi(fixedTree(db));
});

const get = (url: string) => api.request(url);

describe('GET /api/statistics', () => {
  it('svarar med hela databasen som standard', async () => {
    const res = await get('/api/statistics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toMatchObject({ kind: 'all', people: 3 });
    expect(body.lives.total).toBe(3);
    expect(body.names.femaleGiven.length).toBeGreaterThan(0);
  });

  it('avgränsar till en persons förfäder och ättlingar', async () => {
    const body = await (await get('/api/statistics?person=jag')).json();
    expect(body.scope).toMatchObject({ kind: 'person', people: 2 });
    expect(body.scope.person).toMatchObject({ id: 'jag', givenName: 'Erik' });
    expect(body.lives.total).toBe(2);          // jag + mor, inte utom
  });

  it('gives a 404 for an unknown person', async () => {
    const res = await get('/api/statistics?person=finns-inte');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('That person does not exist');
  });

  it('ger 400 för ett tomt person-id', async () => {
    expect((await get('/api/statistics?person=')).status).toBe(400);
  });
});
