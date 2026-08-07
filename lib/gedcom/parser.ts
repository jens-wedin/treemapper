export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value?: string;
  children: GedcomNode[];
}

const LINE_RE = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

/**
 * The longest value a writer puts on one line before it has to continue on the
 * next. MyHeritage uses 200, and so does our own exporter (`MAX_VALUE` in
 * lib/gedcomExport.ts) — keep the two in step.
 *
 * GEDCOM counts the limit in bytes. It matters here: "ö" costs two, so a line
 * filled to 200 bytes can be only 196 characters long, and measuring
 * characters would read a full line as a short one.
 */
const LINE_LIMIT = 200;
const encoder = new TextEncoder();

/** Whether a line was filled up — and so had to continue on the next one. */
function fillsLine(value: string): boolean {
  // Bytes are never fewer than characters, so this only measures the ones
  // that could plausibly be short.
  return value.length >= LINE_LIMIT || encoder.encode(value).length >= LINE_LIMIT;
}

export function parseGedcom(text: string, warnings?: string[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  let last: GedcomNode | undefined;
  /** Did the line just read fill up? See the CONC handling below. */
  let lastLineWasFull = false;
  let lineNo = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    lineNo++;
    const line = rawLine.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const m = line.match(LINE_RE);
    const level = m ? Number(m[1]) : -1;
    const parent = m && level > 0 ? stack[level - 1] : undefined;

    // The export contains note text on its own lines (sometimes starting with
    // digits, giving an implausible level). Fold such lines into the previous
    // node's value instead of crashing — nothing is dropped.
    if (!m || (level > 0 && !parent)) {
      if (!last) throw new Error(`Malformed GEDCOM line: ${JSON.stringify(line)}`);
      last.value = (last.value ?? '') + '\n' + line;
      warnings?.push(`rad ${lineNo}: oigenkännlig rad tolkad som fortsättning: ${JSON.stringify(line)}`);
      continue;
    }

    const xref = m[2];
    const tag = m[3];
    const value = m[4];

    /**
     * CONT means "new line" and CONC means "join with no separator". But
     * MyHeritage never writes CONT — every one of the 10 190 continuations in
     * our export is CONC, including the ones that separate "Kön: Man" from
     * "Hemvist: Sundsvall". Taken literally they concatenate into one run-on
     * string.
     *
     * A writer only has to continue a line once it is full, so a CONC after a
     * line that never reached the limit cannot have been a length split — it
     * is a line break written with the wrong tag. Splits still join silently,
     * which is what keeps a 600-character sentence in one piece.
     */
    if (tag === 'CONC' || tag === 'CONT') {
      const isLineBreak = tag === 'CONT' || !lastLineWasFull;
      parent!.value = (parent!.value ?? '') + (isLineBreak ? '\n' : '') + (value ?? '');
      lastLineWasFull = fillsLine(value ?? '');
      continue;
    }

    lastLineWasFull = fillsLine(value ?? '');
    const node: GedcomNode = { level, tag, xref, value, children: [] };
    stack.length = level;
    if (level === 0) {
      roots.push(node);
    } else {
      parent!.children.push(node);
    }
    stack[level] = node;
    last = node;
  }
  return roots;
}
