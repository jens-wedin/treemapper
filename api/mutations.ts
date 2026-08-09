import { Hono, type Context } from 'hono';
import { personUpdateSchema, eventCreateSchema, eventUpdateSchema, newPersonSchema, relationSchema } from '../lib/schemas';
import type { TreeResolver } from './trees';
import { MutationError, updatePerson, createPerson, createEvent, updateEvent, deleteEvent, addRelation } from '../lib/mutations';
import type { MutationResult } from '../lib/mutations';

function run<T>(c: Context, fn: () => MutationResult<T>) {
  try {
    const { warnings, data } = fn();
    return c.json({ ok: true, warnings, data });
  } catch (e) {
    if (e instanceof MutationError) return c.json({ error: e.message }, e.status);
    throw e;
  }
}

async function parseBody(c: Context) {
  return c.req.json().catch(() => ({}));
}

export function createMutationsApi(tree: TreeResolver) {
  const api = new Hono();

  api.patch('/api/persons/:id', async c => {
    const { db } = tree(c);
    const parsed = personUpdateSchema.safeParse(await parseBody(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    return run(c, () => updatePerson(db, c.req.param('id'), parsed.data));
  });

  /** A person attached to nobody — how an empty tree gets its first record. */
  api.post('/api/persons', async c => {
    const { db } = tree(c);
    const parsed = newPersonSchema.safeParse(await parseBody(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    return run(c, () => createPerson(db, parsed.data));
  });

  api.post('/api/events', async c => {
    const { db } = tree(c);
    const parsed = eventCreateSchema.safeParse(await parseBody(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    return run(c, () => createEvent(db, parsed.data));
  });

  api.patch('/api/events/:id', async c => {
    const { db } = tree(c);
    const parsed = eventUpdateSchema.safeParse(await parseBody(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    return run(c, () => updateEvent(db, Number(c.req.param('id')), parsed.data));
  });

  api.delete('/api/events/:id', c => run(c, () => deleteEvent(tree(c).db, Number(c.req.param('id')))));

  api.post('/api/relations', async c => {
    const { db } = tree(c);
    const parsed = relationSchema.safeParse(await parseBody(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Ogiltiga fält' }, 400);
    return run(c, () => addRelation(db, parsed.data));
  });

  return api;
}
