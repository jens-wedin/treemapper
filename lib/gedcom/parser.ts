export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value?: string;
  children: GedcomNode[];
}

const LINE_RE = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

export function parseGedcom(text: string, warnings?: string[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  let last: GedcomNode | undefined;
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

    if (tag === 'CONC' || tag === 'CONT') {
      parent!.value = (parent!.value ?? '') + (tag === 'CONT' ? '\n' : '') + (value ?? '');
      continue;
    }

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
