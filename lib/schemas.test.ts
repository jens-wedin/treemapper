import { describe, it, expect } from 'vitest';
import { personUpdateSchema, eventCreateSchema, newPersonSchema, relationSchema } from './schemas';

describe('personUpdateSchema', () => {
  it('accepts partial patches', () => {
    expect(personUpdateSchema.parse({ givenName: 'Anna' })).toEqual({ givenName: 'Anna' });
    expect(personUpdateSchema.parse({})).toEqual({});
  });
  it('rejects oversize values', () => {
    expect(personUpdateSchema.safeParse({ givenName: 'x'.repeat(200) }).success).toBe(false);
  });
});

describe('eventCreateSchema', () => {
  it('accepts a valid event', () => {
    const parsed = eventCreateSchema.parse({
      type: 'OCCU', ownerType: 'person', ownerId: 'I1',
      dateRaw: 'ABT 1970', place: null, description: 'Snickare', age: null,
    });
    expect(parsed.type).toBe('OCCU');
  });
  it('rejects lowercase or malformed types', () => {
    expect(eventCreateSchema.safeParse({
      type: 'occu', ownerType: 'person', ownerId: 'I1',
      dateRaw: null, place: null, description: null, age: null,
    }).success).toBe(false);
  });
});

describe('newPersonSchema', () => {
  it('requires a first name', () => {
    const r = newPersonSchema.safeParse({ givenName: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe('A first name is required');
  });
  it('defaults surname and sex', () => {
    expect(newPersonSchema.parse({ givenName: 'Test' })).toEqual({ givenName: 'Test', surname: '', sex: 'U' });
  });
});

describe('relationSchema', () => {
  it('requires exactly one of relativeId / newPerson', () => {
    expect(relationSchema.safeParse({ type: 'child', personId: 'I1' }).success).toBe(false);
    expect(relationSchema.safeParse({
      type: 'child', personId: 'I1', relativeId: 'I2', newPerson: { givenName: 'X' },
    }).success).toBe(false);
    expect(relationSchema.safeParse({ type: 'child', personId: 'I1', relativeId: 'I2' }).success).toBe(true);
    expect(relationSchema.safeParse({
      type: 'spouse', personId: 'I1', newPerson: { givenName: 'X' },
    }).success).toBe(true);
  });
});
