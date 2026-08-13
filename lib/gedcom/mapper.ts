import type { GedcomNode } from './parser';
import { canonicalForm } from './mediaType';
import { extractYear } from '../dates';
import type { persons, families, familyChildren, events, sources, citations, media } from '../../db/schema';

export interface MappedData {
  persons: (typeof persons.$inferInsert)[];
  families: (typeof families.$inferInsert)[];
  familyChildren: (typeof familyChildren.$inferInsert)[];
  events: (typeof events.$inferInsert)[];
  sources: (typeof sources.$inferInsert)[];
  citations: (typeof citations.$inferInsert)[];
  media: (typeof media.$inferInsert)[];
  albums: number;
  warnings: string[];
}

const EVENT_TAGS = new Set([
  'BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM', 'MARR', 'DIV', 'RESI', 'OCCU',
  'EDUC', 'GRAD', 'EMIG', 'IMMI', 'NATU', 'CONF', 'EVEN', 'ADOP', 'RETI', 'CENS',
  'PROB', 'WILL',
]);

const stripAt = (v: string | undefined) => v?.replace(/@/g, '') ?? '';
const child = (n: GedcomNode, tag: string) => n.children.find(c => c.tag === tag);
const childValue = (n: GedcomNode, tag: string) => child(n, tag)?.value;

interface RawTag { tag: string; value?: string; children?: RawTag[] }
function toRaw(n: GedcomNode): RawTag {
  const r: RawTag = { tag: n.tag };
  if (n.value !== undefined) r.value = n.value;
  if (n.children.length) r.children = n.children.map(toRaw);
  return r;
}
function serializeRaw(nodes: GedcomNode[]): string | null {
  return nodes.length ? JSON.stringify(nodes.map(toRaw)) : null;
}

export function mapGedcom(records: GedcomNode[]): MappedData {
  const out: MappedData = {
    persons: [], families: [], familyChildren: [], events: [],
    sources: [], citations: [], media: [], albums: 0, warnings: [],
  };
  let eventId = 0;
  let citationId = 0;
  let mediaId = 0;
  let fcId = 0;

  const addCitations = (node: GedcomNode, ownerType: 'event' | 'person' | 'family', ownerId: string): GedcomNode[] => {
    // Returns SOUR nodes that could NOT be consumed (inline sources) for raw_tags.
    const leftovers: GedcomNode[] = [];
    for (const s of node.children.filter(c => c.tag === 'SOUR')) {
      if (!s.value?.startsWith('@')) {
        out.warnings.push(`Inline SOUR (not a pointer) on ${ownerType} ${ownerId} kept in raw_tags`);
        leftovers.push(s);
        continue;
      }
      const raw: GedcomNode[] = [];
      let text: string | null = null;
      for (const c of s.children) {
        if (c.tag === 'PAGE' || c.tag === 'QUAY') continue;
        if (c.tag === 'DATA') {
          // First TEXT wins: some writers spread DATA over several nodes, and
          // letting a later empty one overwrite would drop the text entirely.
          text ??= childValue(c, 'TEXT') ?? null;
          // DATA can carry more than TEXT (e.g. DATE) — keep the rest lossless
          const dataLeft = c.children.filter(x => x.tag !== 'TEXT');
          if (dataLeft.length) raw.push({ ...c, children: dataLeft });
          continue;
        }
        raw.push(c);
      }
      out.citations.push({
        id: ++citationId,
        ownerType,
        ownerId,
        sourceId: stripAt(s.value),
        page: childValue(s, 'PAGE') ?? null,
        quality: childValue(s, 'QUAY') != null ? Number(childValue(s, 'QUAY')) : null,
        text,
        rawTags: serializeRaw(raw),
      });
    }
    return leftovers;
  };

  const addEvent = (node: GedcomNode, ownerType: 'person' | 'family', ownerId: string) => {
    const id = ++eventId;
    const consumed = new Set(['DATE', 'PLAC', 'AGE', 'SOUR']);
    const typeVal = childValue(node, 'TYPE');
    if (node.tag === 'EVEN') consumed.add('TYPE');
    const plac = childValue(node, 'PLAC');
    const addrNode = child(node, 'ADDR');
    let addr: string | undefined;
    if (!plac && addrNode) {
      addr = [addrNode.value, ...addrNode.children.map(c => c.value)].filter(Boolean).join(', ') || undefined;
      consumed.add('ADDR');
    }
    const dateRaw = childValue(node, 'DATE') ?? null;
    const description = node.tag === 'EVEN'
      ? [typeVal, node.value].filter(Boolean).join(': ') || null
      : node.value ?? null;
    const leftoverSours = addCitations(node, 'event', String(id));
    out.events.push({
      id,
      ownerType,
      ownerId,
      type: node.tag,
      dateRaw,
      dateYear: extractYear(dateRaw),
      place: plac ?? addr ?? null,
      description,
      age: childValue(node, 'AGE') ?? null,
      rawTags: serializeRaw([...node.children.filter(c => !consumed.has(c.tag)), ...leftoverSours]),
    });
  };

  const isEventNode = (c: GedcomNode) =>
    EVENT_TAGS.has(c.tag) || (!!c.children.length && (!!child(c, 'DATE') || !!child(c, 'PLAC')));

  for (const rec of records) {
    if (rec.tag === 'HEAD' || rec.tag === 'TRLR') continue;
    if (rec.tag === 'ALBUM') { out.albums++; continue; }
    const id = stripAt(rec.xref);

    if (rec.tag === 'INDI') {
      const raw: GedcomNode[] = [];
      const notes: string[] = [];
      let nameSeen = false;
      let givenName = '', surname = '';
      let marriedName: string | null = null, suffix: string | null = null;
      let sex: 'M' | 'F' | 'U' = 'U';

      for (const c of rec.children) {
        if (c.tag === 'NAME' && !nameSeen) {
          nameSeen = true;
          const m = c.value?.match(/^([^/]*?)\s*\/([^/]*)\/\s*(.*)$/);
          givenName = childValue(c, 'GIVN') ?? m?.[1]?.trim() ?? c.value?.trim() ?? '';
          surname = childValue(c, 'SURN') ?? m?.[2]?.trim() ?? '';
          suffix = childValue(c, 'NSFX') ?? (m?.[3]?.trim() || null);
          // MyHeritage puts _MARNM under NAME
          marriedName = childValue(c, '_MARNM') ?? marriedName;
          const nameConsumed = new Set(['GIVN', 'SURN', 'NSFX', '_MARNM']);
          const nameLeft = c.children.filter(x => !nameConsumed.has(x.tag));
          if (nameLeft.length) raw.push({ ...c, children: nameLeft });
        } else if (c.tag === '_MARNM') {
          marriedName = c.value ?? null;
        } else if (c.tag === 'SEX') {
          sex = c.value === 'M' || c.value === 'F' ? c.value : 'U';
        } else if (c.tag === 'NOTE') {
          if (c.value) notes.push(c.value);
        } else if (c.tag === 'OBJE') {
          const url = childValue(c, 'FILE');
          if (!url?.startsWith('http')) {
            out.warnings.push(`OBJE without http FILE on ${id} kept in raw_tags`);
            raw.push(c);
            continue;
          }
          const consumed = new Set(['FILE', 'FORM', 'TITL', '_FILESIZE']);
          out.media.push({
            id: ++mediaId,
            ownerType: 'person',
            ownerId: id,
            title: childValue(c, 'TITL') ?? null,
            originalUrl: url,
            form: canonicalForm(childValue(c, 'FORM') ?? null),
            filesize: childValue(c, '_FILESIZE') != null ? Number(childValue(c, '_FILESIZE')) : null,
            downloadStatus: 'pending',
            rawTags: serializeRaw(c.children.filter(x => !consumed.has(x.tag))),
          });
        } else if (c.tag === 'SOUR') {
          // consumed by addCitations(rec, …) below; only kept out of raw here
        } else if (c.tag === 'FAMC' || c.tag === 'FAMS') {
          // relations are derived from FAM records; drop
        } else if (isEventNode(c)) {
          if (!EVENT_TAGS.has(c.tag)) out.warnings.push(`Treating unknown tag ${c.tag} on ${id} as event`);
          addEvent(c, 'person', id);
        } else {
          raw.push(c);
        }
      }
      const leftoverSours = addCitations(rec, 'person', id);
      out.persons.push({
        id, givenName, surname, marriedName, suffix, sex,
        note: notes.length ? notes.join('\n\n') : null,
        rawTags: serializeRaw([...raw, ...leftoverSours]),
      });
    } else if (rec.tag === 'FAM') {
      const raw: GedcomNode[] = [];
      const notes: string[] = [];
      let husbandId: string | null = null, wifeId: string | null = null;
      let seq = 0;
      for (const c of rec.children) {
        if (c.tag === 'HUSB') husbandId = stripAt(c.value);
        else if (c.tag === 'WIFE') wifeId = stripAt(c.value);
        else if (c.tag === 'CHIL') out.familyChildren.push({ id: ++fcId, familyId: id, childId: stripAt(c.value), seq: seq++ });
        else if (c.tag === 'NOTE') { if (c.value) notes.push(c.value); }
        else if (c.tag === 'SOUR') { /* handled below */ }
        else if (isEventNode(c)) addEvent(c, 'family', id);
        else raw.push(c);
      }
      const leftoverSours = addCitations(rec, 'family', id);
      out.families.push({
        id, husbandId, wifeId,
        note: notes.length ? notes.join('\n\n') : null,
        rawTags: serializeRaw([...raw, ...leftoverSours]),
      });
    } else if (rec.tag === 'SOUR') {
      const consumed = new Set(['TITL', 'AUTH', 'PUBL', 'NOTE', 'TEXT']);
      out.sources.push({
        id,
        title: childValue(rec, 'TITL') ?? null,
        author: childValue(rec, 'AUTH') ?? null,
        publication: childValue(rec, 'PUBL') ?? null,
        // NOTE is what the researcher says about the source; TEXT is what the
        // source itself says — a transcription, or an archive's description of
        // its collection. TEXT used to fall back into `note`, which put 478
        // MyHeritage blurbs where a person's own remarks belong.
        note: childValue(rec, 'NOTE') ?? null,
        transcription: childValue(rec, 'TEXT') ?? null,
        rawTags: serializeRaw(rec.children.filter(c => !consumed.has(c.tag))),
      });
    } else {
      out.warnings.push(`Skipped unknown level-0 record ${rec.tag} ${id}`);
    }
  }
  return out;
}
