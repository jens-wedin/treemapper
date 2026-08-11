import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, events, families, familyChildren, issueDismissals } from '../db/schema';
import { updatePerson, updateEvent, createEvent, deleteEvent, removeChildLink } from './mutations';
import { mergePersons } from './merge';
import { detectIssues } from './issues';
import { addPhoto, removePhoto } from './media';
import { buildIssueLog, buildPersonLog } from './issueLog';

let db: Db;
const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedin-log-media-'));

beforeEach(() => {
  db = createDb(':memory:');
  db.insert(persons).values([
    { id: 'I1', givenName: 'jonas', surname: 'Larsson', sex: 'M' },
    { id: 'I2', givenName: 'Anna', surname: 'Larsson', sex: 'F' },
    { id: 'I3', givenName: 'Anna', surname: 'Larsson', sex: 'F' },
  ]).run();
  db.insert(events).values([
    { id: 1, ownerType: 'person', ownerId: 'I1', type: 'DEAT', dateRaw: null, dateYear: null },
    { id: 2, ownerType: 'person', ownerId: 'I2', type: 'BIRT', dateRaw: '1890', dateYear: 1890 },
  ]).run();
});

describe('buildIssueLog — edits', () => {
  it('names the field and both values when a person is corrected', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({ kind: 'changed', personId: 'I1' });
    expect(entry).toMatchObject({ code: 'log.personChanged', params: { name: 'Jonas Larsson' } });
    expect(entry!.changes).toEqual([{ field: 'givenName', before: 'jonas', after: 'Jonas' }]);
  });

  it('says which event changed, and for whom', () => {
    updateEvent(db, 1, { dateRaw: '17 mar 1942' });
    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({ code: 'log.eventChanged', params: { event: 'DEAT', name: 'jonas Larsson' }, personId: 'I1' });
    expect(entry!.changes).toEqual([{ field: 'dateRaw', before: null, after: '17 mar 1942' }]);
  });

  it('tells added events from removed ones', () => {
    createEvent(db, {
      ownerType: 'person', ownerId: 'I1', type: 'BIRT',
      dateRaw: '1900', place: null, description: null, age: null,
    });
    deleteEvent(db, 2);
    const entries = buildIssueLog(db);
    expect(entries.some(e => e.code === 'log.eventRemoved' && e.params.event === 'BIRT')).toBe(true);
    expect(entries.some(e => e.code === 'log.eventAdded' && e.params.event === 'BIRT')).toBe(true);
  });

  it('names both records in a merge', () => {
    mergePersons(db, { survivorId: 'I2', duplicateId: 'I3' });
    const [entry] = buildIssueLog(db);
    expect(entry!.kind).toBe('changed');
    expect(entry).toMatchObject({ code: 'log.merged', params: { duplicate: 'Anna Larsson', id: 'I3' }, personId: 'I2' });
  });

  it('does not count the import as work done', () => {
    db.insert(persons).values({ id: 'I9', givenName: 'Ny', surname: 'Person', sex: 'U' }).run();
    expect(buildIssueLog(db)).toEqual([]);
  });
});

describe('buildIssueLog — dismissals', () => {
  const dismiss = (fingerprint: string, note?: string) =>
    db.insert(issueDismissals)
      .values({ fingerprint, dismissedAt: '2026-08-08T10:00:00.000Z', note: note ?? null })
      .run();

  it('shows which problem was set aside, and the note', () => {
    const issue = detectIssues(db).find(i => i.personIds[0] === 'I1')!;
    dismiss(issue.fingerprint, 'kollat i kyrkboken');

    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({
      kind: 'dismissed',
      code: `issueTitle.${issue.code}`,
      severity: issue.severity,
      note: 'kollat i kyrkboken',
      personId: 'I1',
    });
    expect(entry!.params).toEqual({ name: 'jonas Larsson' });
  });

  it('also lists a dismissal whose problem has stopped occurring', () => {
    dismiss('deadbeefdeadbeef');
    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({ kind: 'dismissed', code: 'log.dismissedGone', severity: null, personId: null });
  });
});

describe('buildIssueLog — order', () => {
  it('gives the newest first and stops at the limit', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    updatePerson(db, 'I2', { surname: 'Larsdotter' });
    updatePerson(db, 'I1', { surname: 'Larsson Hatt' });

    const all = buildIssueLog(db);
    expect(all).toHaveLength(3);
    expect(all[0]!.changes).toEqual([{ field: 'surname', before: 'Larsson', after: 'Larsson Hatt' }]);
    expect([...all].sort((a, b) => b.at.localeCompare(a.at)).map(e => e.at)).toEqual(all.map(e => e.at));

    expect(buildIssueLog(db, 2)).toHaveLength(2);
  });
});

describe('buildPersonLog', () => {
  it('includes edits to the person and to their events', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    updateEvent(db, 1, { dateRaw: '17 mar 1942' });   // I1:s dödsfall
    updatePerson(db, 'I2', { surname: 'Larsdotter' }); // någon annan

    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(2);
    expect(log.every(e => e.personId === 'I1')).toBe(true);
    expect(log[0]!.params.event).toBe('DEAT');          // newest first
    expect(log[1]!.changes[0]!.field).toBe('givenName');
  });

  it('includes photos added and removed', () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const { id } = addPhoto(db, { ownerId: 'I1', title: 'Farmor', mimeType: 'image/png', bytes: pixel }, photoDir);
    removePhoto(db, id);

    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(2);
    expect(log[0]!.code).toBe('log.photoRemovedNamed');    // newest first
    expect(log[0]!.params.title).toBe('Farmor');
    expect(log[1]!.code).toBe('log.photoAddedNamed');
    // och det hamnar hos rätt person
    expect(buildPersonLog(db, 'I2')).toEqual([]);
  });

  it('keeps other people\'s edits out', () => {
    updatePerson(db, 'I2', { surname: 'Larsdotter' });
    expect(buildPersonLog(db, 'I1')).toEqual([]);
  });

  it('includes a merge the person survived', () => {
    mergePersons(db, { survivorId: 'I2', duplicateId: 'I3' });
    const log = buildPersonLog(db, 'I2');
    expect(log).toHaveLength(1);
    expect(log[0]!.code).toBe('log.merged');
  });

  it('includes being detached from a family', () => {
    db.insert(families).values({ id: 'F9', husbandId: 'I2', wifeId: null }).run();
    db.insert(familyChildren).values({ familyId: 'F9', childId: 'I1', seq: 0 }).run();
    removeChildLink(db, 'F9', 'I1');

    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(1);
    expect(log[0]!.params.entityId).toContain('F9');
  });

  it('includes a deleted event, which exists only in the before-image', () => {
    deleteEvent(db, 1);
    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(1);
    expect(log[0]!.code).toBe('log.eventRemoved');
  });

  it('does not count the import as an edit, and stops at the limit', () => {
    for (const given of ['A', 'B', 'C']) updatePerson(db, 'I1', { givenName: given });
    expect(buildPersonLog(db, 'I1')).toHaveLength(3);
    expect(buildPersonLog(db, 'I1', 2)).toHaveLength(2);
  });
});
