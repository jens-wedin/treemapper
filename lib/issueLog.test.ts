import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, events, families, familyChildren, issueDismissals } from '../db/schema';
import { updatePerson, updateEvent, createEvent, deleteEvent, removeChildLink } from './mutations';
import { mergePersons } from './merge';
import { detectIssues } from './issues';
import { buildIssueLog, buildPersonLog } from './issueLog';

let db: Db;

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

describe('buildIssueLog — ändringar', () => {
  it('namnger fältet och båda värdena när en person rättas', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({ kind: 'changed', personId: 'I1' });
    expect(entry!.summary).toContain('Jonas Larsson');
    expect(entry!.summary).toContain('förnamn');
    expect(entry!.summary).toContain('jonas');
  });

  it('säger vilken händelse som ändrades och för vem', () => {
    updateEvent(db, 1, { dateRaw: '17 mar 1942' });
    const [entry] = buildIssueLog(db);
    expect(entry!.summary).toContain('Död');
    expect(entry!.summary).toContain('jonas Larsson');
    expect(entry!.summary).toContain('17 mar 1942');
    expect(entry!.personId).toBe('I1');
  });

  it('skiljer på tillagda och borttagna händelser', () => {
    createEvent(db, {
      ownerType: 'person', ownerId: 'I1', type: 'BIRT',
      dateRaw: '1900', place: null, description: null, age: null,
    });
    deleteEvent(db, 2);
    const summaries = buildIssueLog(db).map(e => e.summary);
    expect(summaries.some(s => s.includes('Födelse') && s.includes('borttagen'))).toBe(true);
    expect(summaries.some(s => s.includes('Födelse') && s.includes('tillagd'))).toBe(true);
  });

  it('namnger båda posterna i en sammanslagning', () => {
    mergePersons(db, { survivorId: 'I2', duplicateId: 'I3' });
    const [entry] = buildIssueLog(db);
    expect(entry!.kind).toBe('changed');
    expect(entry!.summary).toContain('Anna Larsson');
    expect(entry!.summary).toContain('I3');
    expect(entry!.personId).toBe('I2');
  });

  it('räknar inte importen som utfört arbete', () => {
    db.insert(persons).values({ id: 'I9', givenName: 'Ny', surname: 'Person', sex: 'U' }).run();
    expect(buildIssueLog(db)).toEqual([]);
  });
});

describe('buildIssueLog — avfärdade', () => {
  const dismiss = (fingerprint: string, note?: string) =>
    db.insert(issueDismissals)
      .values({ fingerprint, dismissedAt: '2026-08-08T10:00:00.000Z', note: note ?? null })
      .run();

  it('visar vilket problem som lades åt sidan, och anteckningen', () => {
    const issue = detectIssues(db).find(i => i.personIds[0] === 'I1')!;
    dismiss(issue.fingerprint, 'kollat i kyrkboken');

    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({
      kind: 'dismissed',
      category: issue.category,
      severity: issue.severity,
      note: 'kollat i kyrkboken',
      personId: 'I1',
    });
    expect(entry!.summary).toContain(issue.category);
  });

  it('listar även det som avfärdats och sedan slutat inträffa', () => {
    dismiss('deadbeefdeadbeef');
    const [entry] = buildIssueLog(db);
    expect(entry).toMatchObject({ kind: 'dismissed', category: null, personId: null });
    expect(entry!.summary).toBeTruthy();
  });
});

describe('buildIssueLog — ordning', () => {
  it('ger det senaste först och stannar vid gränsen', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    updatePerson(db, 'I2', { surname: 'Larsdotter' });
    updatePerson(db, 'I1', { surname: 'Larsson Hatt' });

    const all = buildIssueLog(db);
    expect(all).toHaveLength(3);
    expect(all[0]!.summary).toContain('Larsson Hatt');
    expect([...all].sort((a, b) => b.at.localeCompare(a.at)).map(e => e.at)).toEqual(all.map(e => e.at));

    expect(buildIssueLog(db, 2)).toHaveLength(2);
  });
});

describe('buildPersonLog', () => {
  it('tar med ändringar på personen själv och på hens händelser', () => {
    updatePerson(db, 'I1', { givenName: 'Jonas' });
    updateEvent(db, 1, { dateRaw: '17 mar 1942' });   // I1:s dödsfall
    updatePerson(db, 'I2', { surname: 'Larsdotter' }); // någon annan

    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(2);
    expect(log.every(e => e.personId === 'I1')).toBe(true);
    expect(log[0]!.summary).toContain('Död');          // senast först
    expect(log[1]!.summary).toContain('förnamn');
  });

  it('håller andras ändringar utanför', () => {
    updatePerson(db, 'I2', { surname: 'Larsdotter' });
    expect(buildPersonLog(db, 'I1')).toEqual([]);
  });

  it('tar med en sammanslagning där personen blev kvar', () => {
    mergePersons(db, { survivorId: 'I2', duplicateId: 'I3' });
    const log = buildPersonLog(db, 'I2');
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toContain('Slog ihop');
  });

  it('tar med när personen lossats ur en familj', () => {
    db.insert(families).values({ id: 'F9', husbandId: 'I2', wifeId: null }).run();
    db.insert(familyChildren).values({ familyId: 'F9', childId: 'I1', seq: 0 }).run();
    removeChildLink(db, 'F9', 'I1');

    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toContain('F9');
  });

  it('tar med en borttagen händelse, som bara finns i före-bilden', () => {
    deleteEvent(db, 1);
    const log = buildPersonLog(db, 'I1');
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toContain('borttagen');
  });

  it('räknar inte importen som en ändring och stannar vid gränsen', () => {
    for (const given of ['A', 'B', 'C']) updatePerson(db, 'I1', { givenName: given });
    expect(buildPersonLog(db, 'I1')).toHaveLength(3);
    expect(buildPersonLog(db, 'I1', 2)).toHaveLength(2);
  });
});
