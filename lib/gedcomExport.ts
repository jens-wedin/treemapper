import { asc } from 'drizzle-orm';
import type { Db } from '../db/client';
import { persons, families, familyChildren, events, sources, citations, media, treeMeta } from '../db/schema';
import { extensionUri } from './gedcom/extensions';
import { mediaType } from './gedcom/mediaType';

export interface ExportOptions {
  /** Fixed header date, for deterministic tests. */
  now?: Date;
  /** GEDCOM version to write. Defaults to 5.5.1. */
  version?: '5.5.1' | '7.0';
}

interface RawTag { tag: string; value?: string; pointer?: string; children?: RawTag[] }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// GEDCOM 5.5.1 caps a line at 255 bytes including level and tag — split well below.
const MAX_VALUE = 200;

export class Writer {
  private lines: string[] = [];
  /** Every tag emitted through line(), for building a 7.0 SCHMA block. */
  readonly tags = new Set<string>();

  constructor(private version: '5.5.1' | '7.0') {}

  /** Emits a line, splitting long values with CONC and newlines with CONT. */
  line(level: number, tag: string, value?: string | null, xref?: string) {
    this.tags.add(tag);
    const head = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;
    if (value == null || value === '') {
      this.lines.push(head);
      return;
    }
    const [firstChunk, ...restChunks] = splitValue(value, this.version);
    this.lines.push(`${head} ${firstChunk!.text}`);
    for (const chunk of restChunks) {
      this.lines.push(`${level + 1} ${chunk.continuation} ${chunk.text}`);
    }
  }

  toString(): string {
    return this.lines.join('\r\n');
  }
}

interface Chunk { text: string; continuation: 'CONC' | 'CONT' }

function splitValue(value: string, version: '5.5.1' | '7.0'): Chunk[] {
  const chunks: Chunk[] = [];
  // Imported text can carry \r\n or lone \r inside a value — normalise first so
  // no stray carriage return ends up inside an exported line.
  const rows = value.replace(/\r\n?/g, '\n').split('\n');
  rows.forEach((row, rowIndex) => {
    if (version === '7.0') {
      // 7.0 has no line-length limit and no CONC — a newline is a CONT, nothing else.
      chunks.push({ text: row, continuation: rowIndex > 0 ? 'CONT' : 'CONC' });
      return;
    }
    let rest = row;
    let first = true;
    do {
      const text = rest.slice(0, MAX_VALUE);
      rest = rest.slice(MAX_VALUE);
      chunks.push({
        text,
        continuation: first && rowIndex > 0 ? 'CONT' : 'CONC',
      });
      first = false;
    } while (rest.length > 0);
  });
  return chunks;
}

function parseRawTags(json: string | null | undefined): RawTag[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as RawTag[];
  } catch {
    return [];
  }
}

function writeRawNodes(w: Writer, level: number, nodes: RawTag[]) {
  for (const node of nodes) {
    const value = node.pointer ? `@${node.pointer}@` : node.value;
    w.line(level, node.tag, value ?? null);
    if (node.children?.length) writeRawNodes(w, level + 1, node.children);
  }
}

function writeRawTags(w: Writer, level: number, json: string | null | undefined) {
  writeRawNodes(w, level, parseRawTags(json));
}

function writeCitations(w: Writer, level: number, rows: typeof citations.$inferSelect[]) {
  for (const c of rows) {
    w.line(level, 'SOUR', `@${c.sourceId}@`);
    if (c.page) w.line(level + 1, 'PAGE', c.page);
    if (c.quality != null) w.line(level + 1, 'QUAY', String(c.quality));

    /**
     * The mapper lifted TEXT out of DATA and kept DATA's other children (a
     * DATE, usually) in raw_tags. Writing those as two separate DATA nodes
     * loses the text on the way back in: a reader takes the last DATA it sees,
     * and that one has no TEXT. So the text goes back inside the DATA it came
     * from, and only a citation without one gets a DATA of its own.
     */
    const raw = parseRawTags(c.rawTags);
    if (c.text) {
      const data = raw.find(t => t.tag === 'DATA');
      if (data) data.children = [{ tag: 'TEXT', value: c.text }, ...(data.children ?? [])];
      else raw.unshift({ tag: 'DATA', children: [{ tag: 'TEXT', value: c.text }] });
    }
    writeRawNodes(w, level + 1, raw);
  }
}

function writeEvents(w: Writer, rows: typeof events.$inferSelect[], citationsByEvent: Map<string, typeof citations.$inferSelect[]>) {
  for (const e of rows) {
    // The mapper folded an EVEN's TYPE into "TYPE: value" — split it back out.
    let value = e.description;
    let type: string | null = null;
    if (e.type === 'EVEN' && e.description) {
      const m = /^([^:]+): (.*)$/.exec(e.description);
      if (m) {
        type = m[1]!;
        value = m[2]!;
      }
    }
    w.line(1, e.type, value ?? null);
    if (type) w.line(2, 'TYPE', type);
    if (e.dateRaw) w.line(2, 'DATE', e.dateRaw);
    if (e.place) w.line(2, 'PLAC', e.place);
    if (e.age) w.line(2, 'AGE', e.age);
    writeCitations(w, 2, citationsByEvent.get(String(e.id)) ?? []);
    writeRawTags(w, 2, e.rawTags);
  }
}

function headerDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Builds the HEAD record for the given version. 5.5.1 keeps the fixed
 * CHAR/GEDC.FORM pair; 7.0 drops both (UTF-8 and LINEAGE-LINKED are implicit
 * in the spec) and instead declares every extension (underscore) tag the
 * body emitted, so a 7.0-aware reader knows what `_MARNM` etc. mean.
 */
function writeHeader(version: '5.5.1' | '7.0', treeName: string | null, now: Date, emittedTags: Set<string>): string {
  const h = new Writer(version);
  h.line(0, 'HEAD');
  h.line(1, 'SOUR', 'TREEMAPPER');
  if (treeName) h.line(2, 'NAME', treeName);
  h.line(2, 'VERS', '0.1.0');
  h.line(1, 'DATE', headerDate(now));
  h.line(1, 'GEDC');
  h.line(2, 'VERS', version);
  if (version === '5.5.1') {
    h.line(2, 'FORM', 'LINEAGE-LINKED');
    h.line(1, 'CHAR', 'UTF-8');
  } else {
    const ext = [...emittedTags].filter(t => t.startsWith('_')).sort();
    if (ext.length) {
      h.line(1, 'SCHMA');
      for (const tag of ext) h.line(2, 'TAG', `${tag} ${extensionUri(tag)}`);
    }
  }
  return h.toString();
}

/**
 * Serialises the whole database back to GEDCOM — backup and escape hatch
 * (spec §8). Everything the import preserved is re-emitted, including the
 * raw_tags subtrees, so re-importing our own output reproduces the tree.
 * Defaults to 5.5.1; pass `{ version: '7.0' }` for the modern header.
 */
export function exportGedcom(db: Db, opts: ExportOptions = {}): string {
  const version = opts.version ?? '5.5.1';
  const w = new Writer(version);
  const now = opts.now ?? new Date();
  const treeName = db.select().from(treeMeta).all()[0]?.name ?? null;

  const allPersons = db.select().from(persons).orderBy(asc(persons.id)).all();
  const allFamilies = db.select().from(families).orderBy(asc(families.id)).all();
  const allSources = db.select().from(sources).orderBy(asc(sources.id)).all();
  const allEvents = db.select().from(events).orderBy(asc(events.id)).all();
  const allCitations = db.select().from(citations).orderBy(asc(citations.id)).all();
  const allMedia = db.select().from(media).orderBy(asc(media.id)).all();
  const allLinks = db.select().from(familyChildren).all();

  const eventsByOwner = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    const key = `${e.ownerType}:${e.ownerId}`;
    const list = eventsByOwner.get(key) ?? [];
    list.push(e);
    eventsByOwner.set(key, list);
  }
  const citationsByOwner = new Map<string, typeof allCitations>();
  for (const c of allCitations) {
    const key = `${c.ownerType}:${c.ownerId}`;
    const list = citationsByOwner.get(key) ?? [];
    list.push(c);
    citationsByOwner.set(key, list);
  }
  const citationsByEvent = new Map<string, typeof allCitations>();
  for (const c of allCitations.filter(x => x.ownerType === 'event')) {
    const list = citationsByEvent.get(c.ownerId) ?? [];
    list.push(c);
    citationsByEvent.set(c.ownerId, list);
  }
  const mediaByPerson = new Map<string, typeof allMedia>();
  for (const m of allMedia.filter(x => x.ownerType === 'person')) {
    const list = mediaByPerson.get(m.ownerId) ?? [];
    list.push(m);
    mediaByPerson.set(m.ownerId, list);
  }
  const famcOf = new Map<string, string[]>();   // child → families
  for (const l of allLinks) {
    const list = famcOf.get(l.childId) ?? [];
    list.push(l.familyId);
    famcOf.set(l.childId, list);
  }
  const famsOf = new Map<string, string[]>();   // spouse → families
  for (const f of allFamilies) {
    for (const spouse of [f.husbandId, f.wifeId]) {
      if (!spouse) continue;
      const list = famsOf.get(spouse) ?? [];
      list.push(f.id);
      famsOf.set(spouse, list);
    }
  }

  // ---- INDI ----
  for (const p of allPersons) {
    w.line(0, 'INDI', null, `@${p.id}@`);
    const nameValue = `${p.givenName ?? ''} /${p.surname ?? ''}/${p.suffix ? ` ${p.suffix}` : ''}`.trim();
    w.line(1, 'NAME', nameValue);
    if (p.givenName) w.line(2, 'GIVN', p.givenName);
    if (p.surname) w.line(2, 'SURN', p.surname);
    if (p.marriedName) w.line(2, '_MARNM', p.marriedName);
    if (p.suffix) w.line(2, 'NSFX', p.suffix);
    w.line(1, 'SEX', p.sex);
    writeEvents(w, eventsByOwner.get(`person:${p.id}`) ?? [], citationsByEvent);
    writeCitations(w, 1, citationsByOwner.get(`person:${p.id}`) ?? []);
    for (const m of mediaByPerson.get(p.id) ?? []) {
      if (version === '7.0') {
        w.line(1, 'OBJE', `@M${m.id}@`);            // 7.0: pointer to the record
      } else {
        w.line(1, 'OBJE');                          // 5.5.1: embedded (unchanged)
        if (m.form) w.line(2, 'FORM', m.form);
        if (m.originalUrl) w.line(2, 'FILE', m.originalUrl);
        if (m.title) w.line(2, 'TITL', m.title);
        if (m.filesize != null) w.line(2, '_FILESIZE', String(m.filesize));
        writeRawTags(w, 2, m.rawTags);
      }
    }
    if (p.note) w.line(1, 'NOTE', p.note);
    writeRawTags(w, 1, p.rawTags);
    for (const fid of famcOf.get(p.id) ?? []) w.line(1, 'FAMC', `@${fid}@`);
    for (const fid of famsOf.get(p.id) ?? []) w.line(1, 'FAMS', `@${fid}@`);
  }

  // ---- FAM ----
  for (const f of allFamilies) {
    w.line(0, 'FAM', null, `@${f.id}@`);
    if (f.husbandId) w.line(1, 'HUSB', `@${f.husbandId}@`);
    if (f.wifeId) w.line(1, 'WIFE', `@${f.wifeId}@`);
    const kids = allLinks.filter(l => l.familyId === f.id).sort((a, b) => a.seq - b.seq);
    for (const k of kids) w.line(1, 'CHIL', `@${k.childId}@`);
    writeEvents(w, eventsByOwner.get(`family:${f.id}`) ?? [], citationsByEvent);
    writeCitations(w, 1, citationsByOwner.get(`family:${f.id}`) ?? []);
    if (f.note) w.line(1, 'NOTE', f.note);
    writeRawTags(w, 1, f.rawTags);
  }

  // ---- SOUR ----
  for (const s of allSources) {
    w.line(0, 'SOUR', null, `@${s.id}@`);
    if (s.title) w.line(1, 'TITL', s.title);
    if (s.author) w.line(1, 'AUTH', s.author);
    if (s.publication) w.line(1, 'PUBL', s.publication);
    if (s.note) w.line(1, 'NOTE', s.note);
    if (s.transcription) w.line(1, 'TEXT', s.transcription);
    writeRawTags(w, 1, s.rawTags);
  }

  // ---- OBJE (7.0 multimedia records; 5.5.1 embeds media inline above) ----
  if (version === '7.0') {
    for (const m of allMedia) {
      if (m.ownerType !== 'person') continue;     // only the referenced ones
      w.line(0, 'OBJE', null, `@M${m.id}@`);
      w.line(1, 'FILE', m.originalUrl);
      w.line(2, 'FORM', mediaType(m.form) ?? 'application/octet-stream');  // FORM required under FILE in 7.0
      if (m.title) w.line(2, 'TITL', m.title);   // TITL is a sibling of FORM, under FILE — not a direct child of the record
      if (m.filesize != null) w.line(1, '_FILESIZE', String(m.filesize));
      writeRawTags(w, 1, m.rawTags);
    }
  }

  const body = w.toString();
  const header = writeHeader(version, treeName, now, w.tags);
  return `﻿${header}${body ? `\r\n${body}` : ''}\r\n0 TRLR`;
}
