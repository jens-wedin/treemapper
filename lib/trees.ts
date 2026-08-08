import fs from 'node:fs';
import path from 'node:path';
import { eq, ne, sql } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { media, persons, treeMeta } from '../db/schema';
import { runImport, type ImportSummary } from './import';

/**
 * Several unconnected family trees, one SQLite file each.
 *
 * GEDCOM xrefs are only unique inside one file — your tree's I500097 and a
 * cousin's I500097 are different people — so trees cannot share tables. One
 * file per tree makes that whole class of mix-up impossible, and reduces
 * deleting a tree to deleting a file.
 *
 * A tree's name lives in a `tree_meta` row inside the tree itself. There is no
 * central registry to drift out of sync, corrupt, or lose when a .db is copied
 * around: listing the trees is a directory scan plus one row per file.
 */

export interface TreeInfo {
  id: string;
  name: string;
  createdAt: string;
  sourceFile: string | null;
  isDefault: boolean;
  persons: number;
  /** Photos the GEDCOM names but that are not on disk. */
  photosPending: number;
}

export class TreeNotFound extends Error {
  constructor(id: string) {
    super(`Släktträdet finns inte: ${id}`);
    this.name = 'TreeNotFound';
  }
}

/** The tree that was here before this feature existed, and that the CLI owns. */
export const DEFAULT_TREE = 'default';

// Read at call time, not at import time: the tests and `npm run dev:e2e` point
// these elsewhere, and a module-level constant would capture the wrong value.
const defaultDbPath = () => process.env.WEDIN_DB ?? 'wedin.db';
const treesDir = () => process.env.WEDIN_TREES_DIR ?? 'trees';
const mediaRoot = () => process.env.WEDIN_MEDIA_DIR ?? 'media';

const fileFor = (id: string) =>
  id === DEFAULT_TREE ? defaultDbPath() : path.join(treesDir(), `${id}.db`);

/** Where a tree's downloaded photos live. The default tree keeps `media/`. */
export const mediaDirFor = (id: string) =>
  id === DEFAULT_TREE ? mediaRoot() : path.join(mediaRoot(), id);

// Keyed by resolved path rather than id, so a test that repoints WEDIN_DB
// cannot be handed the previous test's database.
const open = new Map<string, Db>();

export function closeTrees() {
  for (const db of open.values()) db.$client.close();
  open.clear();
}

/**
 * A database that has never been opened by this module has no name yet — true
 * of `wedin.db`, of `.e2e.db`, and of anything created by `npm run import`.
 * Naming it after its file is a guess the user can correct in the UI.
 */
function ensureMeta(db: Db, file: string) {
  if (db.select().from(treeMeta).all().length) return;
  db.insert(treeMeta).values({
    id: 1,
    name: path.basename(file, '.db'),
    createdAt: new Date().toISOString(),
    sourceFile: null,
  }).run();
}

export function openTree(id: string): Db {
  const file = fileFor(id);
  const cached = open.get(file);
  if (cached) return cached;

  // createDb migrates, and migrating creates the file. Without this check a
  // typo'd id would silently produce an empty tree instead of an error.
  if (id !== DEFAULT_TREE && !fs.existsSync(file)) throw new TreeNotFound(id);

  const db = createDb(file);
  ensureMeta(db, file);
  open.set(file, db);
  return db;
}

function infoFor(id: string): TreeInfo {
  const db = openTree(id);
  const meta = db.select().from(treeMeta).all()[0]!;
  const personCount = db.select({ n: sql<number>`count(*)` }).from(persons).all()[0]?.n ?? 0;
  const pending = db.select({ n: sql<number>`count(*)` }).from(media)
    .where(ne(media.downloadStatus, 'done')).all()[0]?.n ?? 0;
  return {
    id,
    name: meta.name,
    createdAt: meta.createdAt,
    sourceFile: meta.sourceFile,
    isDefault: id === DEFAULT_TREE,
    persons: personCount,
    photosPending: pending,
  };
}

/** The default tree first, then the imported ones by name. */
export function listTrees(): TreeInfo[] {
  const dir = treesDir();
  const imported = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.db')).map(f => path.basename(f, '.db'))
    : [];
  const rest = imported.map(infoFor).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  return [infoFor(DEFAULT_TREE), ...rest];
}

/**
 * `Åsa Öberg` → `asa-oberg`. Filesystem- and URL-safe by construction, so an
 * id never needs escaping anywhere it is used.
 */
function slugify(name: string): string {
  const folded = name.toLowerCase()
    .replace(/[åäàáâã]/g, 'a').replace(/[öòóôõø]/g, 'o').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y').replace(/ç/g, 'c');
  const slug = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return slug || 'trad';
}

function allocateId(name: string): string {
  const base = slugify(name);
  const taken = (id: string) => id === DEFAULT_TREE || fs.existsSync(fileFor(id));
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Reads a GEDCOM into a brand new tree. Nothing existing is touched, matched
 * or merged — the trees never see each other's data.
 *
 * Returns the import summary as well as the tree, because the warnings the
 * import screen shows come from the parse, not from the finished database.
 */
export function createTree(name: string, gedPath: string, sourceFile: string): { tree: TreeInfo; summary: ImportSummary } {
  const id = allocateId(name);
  const file = fileFor(id);
  fs.mkdirSync(treesDir(), { recursive: true });

  let summary: ImportSummary;
  try {
    summary = runImport(gedPath, file);
  } catch (err) {
    // A half-written tree is worse than no tree: it would show up in the list
    // looking like a real one.
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
    throw err;
  }

  const db = openTree(id);
  db.insert(treeMeta).values({
    id: 1,
    name: name.trim() || id,
    createdAt: new Date().toISOString(),
    sourceFile,
  }).onConflictDoUpdate({
    target: treeMeta.id,
    set: { name: name.trim() || id, sourceFile },
  }).run();

  return { tree: infoFor(id), summary };
}

export function renameTree(id: string, name: string): TreeInfo {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Ett släktträd måste ha ett namn');
  const db = openTree(id);
  db.update(treeMeta).set({ name: trimmed }).where(eq(treeMeta.id, 1)).run();
  return infoFor(id);
}

export function deleteTree(id: string) {
  if (id === DEFAULT_TREE) throw new Error('Det ursprungliga släktträdet kan inte tas bort');
  const file = fileFor(id);
  if (!fs.existsSync(file)) throw new TreeNotFound(id);

  const db = open.get(file);
  if (db) {
    db.$client.close();
    open.delete(file);
  }
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  fs.rmSync(mediaDirFor(id), { recursive: true, force: true });
}
