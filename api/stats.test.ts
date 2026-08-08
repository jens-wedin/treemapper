import { describe, it, expect } from 'vitest';
import { createDb } from '../db/client';
import { persons } from '../db/schema';
import { createApi } from './stats';
import { fixedTree } from './trees';

describe('GET /api/stats', () => {
  it('returns counts from the database', async () => {
    const db = createDb(':memory:');
    db.insert(persons).values({ id: 'I1', givenName: 'Anna', surname: 'Larsson', sex: 'F' }).run();
    const api = createApi(fixedTree(db));
    const res = await api.request('/api/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ persons: 1, families: 0, sources: 0, media: 0, mediaDone: 0 });
  });
});
