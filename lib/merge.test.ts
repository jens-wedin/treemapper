import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type Db } from '../db/client';
import { persons, families, familyChildren, events, citations, media, sources, auditLog } from '../db/schema';
import { mergePersons } from './merge';

let db: Db;
let seq = 0;

beforeEach(() => {
  db = createDb(':memory:');
  seq = 0;
  db.insert(sources).values({ id: 'S1', title: 'Testkälla' }).run();
});

function person(id: string, opts: { given?: string; surname?: string; sex?: 'M' | 'F' | 'U'; note?: string | null; marriedName?: string | null } = {}) {
  db.insert(persons).values({
    id,
    givenName: opts.given ?? id,
    surname: opts.surname ?? 'Test',
    sex: opts.sex ?? 'U',
    note: opts.note ?? null,
    marriedName: opts.marriedName ?? null,
  }).run();
  return id;
}

function event(ownerId: string, type: string, year: number | null, ownerType: 'person' | 'family' = 'person') {
  const id = ++seq;
  db.insert(events).values({ id, ownerType, ownerId, type, dateRaw: year ? String(year) : null, dateYear: year }).run();
  return id;
}

function citation(ownerType: 'person' | 'event' | 'family', ownerId: string) {
  const id = ++seq + 1000;
  db.insert(citations).values({ id, ownerType, ownerId, sourceId: 'S1', page: `sida ${id}` }).run();
  return id;
}

function photo(ownerId: string) {
  const id = ++seq + 2000;
  db.insert(media).values({ id, ownerType: 'person', ownerId, originalUrl: `https://x/${id}.jpg`, downloadStatus: 'done', localPath: `media/${id}.jpg` }).run();
  return id;
}

function family(id: string, husbandId: string | null, wifeId: string | null, children: string[] = []) {
  db.insert(families).values({ id, husbandId, wifeId }).run();
  children.forEach((c, i) => db.insert(familyChildren).values({ familyId: id, childId: c, seq: i }).run());
  return id;
}

const rows = {
  persons: () => db.select().from(persons).all(),
  families: () => db.select().from(families).all(),
  links: () => db.select().from(familyChildren).all(),
  events: () => db.select().from(events).all(),
  citations: () => db.select().from(citations).all(),
  media: () => db.select().from(media).all(),
  audit: () => db.select().from(auditLog).all(),
};

describe('mergePersons — flytt av data', () => {
  it('flyttar händelser, källhänvisningar och foton till den som behålls', () => {
    person('KEEP');
    person('DUP');
    event('KEEP', 'BIRT', 1800);
    const dupEvent = event('DUP', 'DEAT', 1870);
    citation('person', 'DUP');
    citation('event', String(dupEvent));
    const dupPhoto = photo('DUP');

    const res = mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    expect(res.data).toMatchObject({ movedEvents: 1, movedCitations: 1, movedMedia: 1 });
    expect(rows.persons().map(p => p.id)).toEqual(['KEEP']);
    expect(rows.events().every(e => e.ownerId === 'KEEP' || e.ownerType === 'family')).toBe(true);
    expect(rows.citations().find(c => c.ownerType === 'person')!.ownerId).toBe('KEEP');
    expect(rows.media().find(m => m.id === dupPhoto)!.ownerId).toBe('KEEP');
    // händelsens egen citation ska fortfarande peka på händelsen
    expect(rows.citations().find(c => c.ownerType === 'event')!.ownerId).toBe(String(dupEvent));
  });

  it('länkar om make/maka-platser och barnlänkar med bevarad ordning', () => {
    person('KEEP', { sex: 'M' });
    person('DUP', { sex: 'M' });
    person('FRU', { sex: 'F' });
    person('BARN1');
    person('BARN2');
    family('F1', 'DUP', 'FRU', ['BARN1', 'BARN2']);   // DUP är make och förälder
    person('MOR', { sex: 'F' });
    family('F2', null, 'MOR', ['DUP']);                // DUP är barn

    const res = mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    expect(res.data.relinkedFamilies).toBe(2);
    expect(rows.families().find(f => f.id === 'F1')!.husbandId).toBe('KEEP');
    expect(rows.links().filter(l => l.familyId === 'F2').map(l => l.childId)).toEqual(['KEEP']);
    expect(rows.links().filter(l => l.familyId === 'F1').sort((a, b) => a.seq - b.seq).map(l => l.childId))
      .toEqual(['BARN1', 'BARN2']);
  });

  it('slår ihop dubbla barnlänkar i samma familj i stället för att skapa dubbletter', () => {
    person('KEEP');
    person('DUP');
    person('MOR', { sex: 'F' });
    family('F1', null, 'MOR', ['KEEP', 'DUP']);   // båda är barn i samma familj

    const res = mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    expect(res.data.mergedChildLinks).toBe(1);
    expect(rows.links().filter(l => l.familyId === 'F1').map(l => l.childId)).toEqual(['KEEP']);
  });

  it('skapar aldrig ett självgifte när båda är makar i samma familj', () => {
    person('KEEP', { sex: 'M' });
    person('DUP', { sex: 'F' });
    person('BARN');
    family('F1', 'KEEP', 'DUP', ['BARN']);

    const res = mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    const f1 = rows.families().find(f => f.id === 'F1')!;
    expect(f1.husbandId).toBe('KEEP');
    expect(f1.wifeId).toBeNull();          // platsen töms i stället för att peka på KEEP
    expect(res.warnings.join(' ')).toMatch(/[Pp]artnerplats/);
  });
});

describe('mergePersons — fältval', () => {
  it('behåller överlevarens värden som standard men fyller tomma fält från dubbletten', () => {
    person('KEEP', { given: 'Anders', surname: 'Johansson', note: null, marriedName: null });
    person('DUP', { given: 'Anders Olof', surname: 'Johansson', note: 'Viktig anteckning', marriedName: 'Lund' });

    mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    const keep = rows.persons()[0]!;
    expect(keep.givenName).toBe('Anders');          // överlevaren vinner
    expect(keep.note).toBe('Viktig anteckning');    // tomt fält fylls
    expect(keep.marriedName).toBe('Lund');
  });

  it('tar dubblettens värde när fältvalet säger det', () => {
    person('KEEP', { given: 'Anders' });
    person('DUP', { given: 'Anders Olof' });

    mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP', fieldChoices: { givenName: 'duplicate' } });

    expect(rows.persons()[0]!.givenName).toBe('Anders Olof');
  });
});

describe('mergePersons — skydd', () => {
  it('avvisar sammanslagning med sig själv och okända personer', () => {
    person('A');
    expect(() => mergePersons(db, { survivorId: 'A', duplicateId: 'A' })).toThrowError('sig själv');
    expect(() => mergePersons(db, { survivorId: 'A', duplicateId: 'SAKNAS' })).toThrowError('finns inte');
  });

  it('avvisar sammanslagning inom samma släktlinje', () => {
    person('FORFADER');
    person('BARNBARN');
    person('MELLAN');
    family('F1', 'FORFADER', null, ['MELLAN']);
    family('F2', 'MELLAN', null, ['BARNBARN']);
    expect(() => mergePersons(db, { survivorId: 'FORFADER', duplicateId: 'BARNBARN' }))
      .toThrowError('samma släktlinje');
  });
});

describe('mergePersons — spårbarhet', () => {
  it('skriver en merge-rad som innehåller båda personerna och alla berörda familjer', () => {
    person('KEEP');
    person('DUP');
    person('FRU', { sex: 'F' });
    family('F1', 'DUP', 'FRU', []);
    event('DUP', 'BIRT', 1800);

    mergePersons(db, { survivorId: 'KEEP', duplicateId: 'DUP' });

    const merges = rows.audit().filter(a => a.action === 'merge');
    expect(merges).toHaveLength(1);
    const before = JSON.parse(merges[0]!.before!);
    expect(before.survivor.id).toBe('KEEP');
    expect(before.duplicate.id).toBe('DUP');
    expect(before.families.map((f: { id: string }) => f.id)).toContain('F1');
    expect(before.events).toHaveLength(1);
    const after = JSON.parse(merges[0]!.after!);
    expect(after.survivor.id).toBe('KEEP');
    expect(after.summary.movedEvents).toBe(1);
  });

  it('rullar tillbaka allt om något går fel mitt i sammanslagningen', () => {
    person('KEEP');
    person('DUP');
    event('DUP', 'BIRT', 1800);
    citation('person', 'DUP');
    photo('DUP');
    family('F1', 'DUP', null, []);
    const personCount = rows.persons().length;

    // Felinjektion: låt sista steget (radera dubbletten) kasta, efter att
    // händelser/källor/familjer redan flyttats — allt måste rullas tillbaka.
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'transaction') {
          return (cb: (tx: unknown) => unknown) =>
            (target as Db).transaction(tx => cb(new Proxy(tx as object, {
              get(t, p, r) {
                if (p === 'delete') return () => { throw new Error('injicerat fel'); };
                return Reflect.get(t, p, r);
              },
            })));
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;

    expect(() => mergePersons(failing, { survivorId: 'KEEP', duplicateId: 'DUP' })).toThrow('injicerat fel');

    expect(rows.persons()).toHaveLength(personCount);
    expect(rows.events()[0]!.ownerId).toBe('DUP');
    expect(rows.citations()[0]!.ownerId).toBe('DUP');
    expect(rows.media()[0]!.ownerId).toBe('DUP');
    expect(rows.families().find(f => f.id === 'F1')!.husbandId).toBe('DUP');
    expect(rows.audit()).toHaveLength(0);
  });
});
