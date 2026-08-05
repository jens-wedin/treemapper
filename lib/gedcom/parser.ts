export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value?: string;
  children: GedcomNode[];
}

const LINE_RE = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

export function parseGedcom(text: string): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const m = line.match(LINE_RE);
    if (!m) throw new Error(`Malformed GEDCOM line: ${JSON.stringify(line)}`);
    const level = Number(m[1]);
    const xref = m[2];
    const tag = m[3];
    const value = m[4];

    if (tag === 'CONC' || tag === 'CONT') {
      const parent = stack[level - 1];
      if (!parent) throw new Error(`Orphan ${tag} at level ${level}`);
      parent.value = (parent.value ?? '') + (tag === 'CONT' ? '\n' : '') + (value ?? '');
      continue;
    }

    const node: GedcomNode = { level, tag, xref, value, children: [] };
    stack.length = level;
    if (level === 0) {
      roots.push(node);
    } else {
      const parent = stack[level - 1];
      if (!parent) throw new Error(`Orphan node at level ${level}: ${line}`);
      parent.children.push(node);
    }
    stack[level] = node;
  }
  return roots;
}
