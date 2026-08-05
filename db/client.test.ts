import { describe, it, expect } from 'vitest';
import { createDb } from './client';
import { persons, events } from './schema';

describe('db client', () => {
  it('creates schema and round-trips a person and event', () => {
    const db = createDb(':memory:');
    db.insert(persons).values({ id: 'I1', givenName: 'Sven-Erik', surname: 'Wedin', sex: 'M' }).run();
    db.insert(events).values({ id: 1, ownerType: 'person', ownerId: 'I1', type: 'BIRT', dateRaw: '15 APR 1942', dateYear: 1942, place: 'Gävleborgs län, Sverige' }).run();
    const p = db.select().from(persons).all();
    expect(p).toHaveLength(1);
    expect(p[0].surname).toBe('Wedin');
    const e = db.select().from(events).all();
    expect(e[0].dateYear).toBe(1942);
  });
});
