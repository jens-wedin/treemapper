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
  /** Which GEDCOM version this tree exports as. Import ignores this. */
  gedcomFormat: '5.5.1' | '7.0';
}

export class TreeNotFound extends Error {
  constructor(id: string) {
    super(`That family tree does not exist: ${id}`);
    this.name = 'TreeNotFound';
  }
}

/**
 * The tree that was here before this feature existed, and that the CLI owns.
 *
 * This is an alias, not the tree's public id: it is what the CLI passes, what
 * older browsers have in storage, and what links written before trees appeared
 * in the URL still say. `defaultTreeId()` is the id people actually see.
 */
export const DEFAULT_TREE = 'default';

// Read at call time, not at import time: the tests and `npm run dev:e2e` point
// these elsewhere, and a module-level constant would capture the wrong value.
const treesDir = () => process.env.TREEMAPPER_TREES_DIR ?? 'trees';
// The default tree lives in the trees directory alongside every other family
// database — one folder for all of them. `TREEMAPPER_DB` still overrides it,
// which is how the tests and `npm run dev:e2e` point it at a throwaway copy.
const defaultDbPath = () => process.env.TREEMAPPER_DB ?? path.join(treesDir(), 'wedin.db');
const mediaRoot = () => process.env.TREEMAPPER_MEDIA_DIR ?? 'media';

/**
 * Ids are slugs by construction — `allocateId` can only ever produce these.
 * Anything else did not come from us and must not be turned into a path.
 *
 * Without this an id of `../wedin` resolves to the family database itself:
 * `DELETE /api/trees/..%2Fwedin` answered 200 and removed wedin.db together
 * with its -wal and -shm, walking straight past the "the default tree cannot
 * be deleted" guard, which only ever compared against the literal `default`.
 */
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertTreeId(id: string): void {
  if (id === DEFAULT_TREE) return;
  if (!SAFE_ID.test(id)) throw new TreeNotFound(id);
}

/**
 * A tree's public id — the `wedin` in `/wedin/personer`.
 *
 * Derived from the database's filename, deliberately not from the display
 * name: a link somebody saved has to keep working after they rename the tree.
 * For imported trees the two already agree, since the file was named after the
 * id when it was created.
 */
const slugForFile = (file: string) => slugify(path.basename(file, '.db'));

/**
 * The default tree answers to two names: its own id, and the legacy `default`.
 * Anything deciding *what a request may touch* has to ask this rather than
 * compare against a string — see `deleteTree`.
 */
const isDefaultId = (id: string) => id === DEFAULT_TREE || id === defaultTreeId();

/** The default tree's public id, e.g. `wedin` for `wedin.db`. */
export function defaultTreeId(): string {
  if (!fs.existsSync(defaultDbPath())) return DEFAULT_TREE;
  return openAt(defaultDbPath()).select().from(treeMeta).all()[0]?.slug || DEFAULT_TREE;
}

const fileFor = (id: string) => {
  if (isDefaultId(id)) return defaultDbPath();
  assertTreeId(id);
  return path.join(treesDir(), `${id}.db`);
};

/**
 * Where a tree's photos live: one folder per tree, named after it.
 *
 * The original tree used to keep its photos loose in `media/` while imported
 * trees got subfolders. That asymmetry was a trap rather than a convenience —
 * media ids are per-database integers, so every tree owns a media 1, and the
 * one tree whose photographs are irreplaceable was the one sitting where a
 * collision would land.
 */
export const mediaDirFor = (id: string) => {
  if (isDefaultId(id)) return path.join(mediaRoot(), defaultTreeId());
  assertTreeId(id);
  return path.join(mediaRoot(), id);
};

// Keyed by resolved path rather than id, so a test that repoints TREEMAPPER_DB
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
  const existing = db.select().from(treeMeta).all()[0];
  if (!existing) {
    db.insert(treeMeta).values({
      id: 1,
      name: path.basename(file, '.db'),
      createdAt: new Date().toISOString(),
      sourceFile: null,
      slug: slugForFile(file),
    }).run();
    return;
  }
  // Written before trees had slugs — wedin.db itself, and any tree imported
  // before this. Backfilling on open means no separate migration step.
  if (!existing.slug) {
    db.update(treeMeta).set({ slug: slugForFile(file) }).where(eq(treeMeta.id, 1)).run();
  }
}

/** Opens a database by path, with no notion of ids — what id resolution is built on. */
function openAt(file: string): Db {
  const cached = open.get(file);
  if (cached) return cached;
  const db = createDb(file);
  ensureMeta(db, file);
  open.set(file, db);
  return db;
}

export function openTree(id: string): Db {
  const file = fileFor(id);

  // createDb migrates, and migrating creates the file. Without this check a
  // typo'd id would silently produce an empty tree instead of an error — and
  // the default tree used to be exempt, which is how a fresh clone ended up
  // holding an empty tree named after somebody else's family.
  if (!open.has(file) && !fs.existsSync(file)) throw new TreeNotFound(id);

  return openAt(file);
}

export function infoFor(id: string): TreeInfo {
  const db = openTree(id);
  const meta = db.select().from(treeMeta).all()[0]!;
  const personCount = db.select({ n: sql<number>`count(*)` }).from(persons).all()[0]?.n ?? 0;
  const pending = db.select({ n: sql<number>`count(*)` }).from(media)
    .where(ne(media.downloadStatus, 'done')).all()[0]?.n ?? 0;
  return {
    // The slug, never the alias the caller happened to use: this is the id
    // that ends up in every link the UI builds.
    id: meta.slug || id,
    name: meta.name,
    createdAt: meta.createdAt,
    sourceFile: meta.sourceFile,
    isDefault: isDefaultId(id),
    persons: personCount,
    photosPending: pending,
    gedcomFormat: meta.gedcomFormat === '5.5.1' ? '5.5.1' : '7.0',
  };
}

/** The default tree first, then the imported ones by name. */
export function listTrees(): TreeInfo[] {
  const dir = treesDir();
  // The default tree sits in this directory too, so the scan finds its file —
  // but it is listed once, as the default below, not a second time here.
  const defaultFile = path.resolve(defaultDbPath());
  const imported = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .filter(f => path.resolve(path.join(dir, f)) !== defaultFile)
      .map(f => path.basename(f, '.db'))
      // Anything not shaped like one of our own ids is not ours to open.
      .filter(name => SAFE_ID.test(name))
    : [];
  const rest = imported.map(infoFor).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  // Only when the file is on disk. A clone of this repository has no default
  // tree and should be told so, not handed one.
  const first = fs.existsSync(defaultDbPath()) ? [infoFor(DEFAULT_TREE)] : [];
  return [...first, ...rest];
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
  // Not `trad`: that is the chart page, so it is reserved, and a nameless tree
  // would come out as `trad-2` — a second of something there is no first of.
  return slug || 'slakt';
}

/**
 * Ids the router needs for itself. A tree is the first segment of every
 * address, so a tree called "People" would make `/people` ambiguous —
 * either the People page or that tree, and no way to tell.
 *
 * The Swedish segments stay reserved. The routes no longer answer to them, but
 * a tree named "Källor" would still slug to `kallor`, and an old bookmark
 * reaching it would land somewhere its author never meant.
 */
const RESERVED = new Set([
  'people', 'person', 'tree', 'statistics', 'issues', 'sources', 'source', 'settings', 'api',
  'personer', 'trad', 'statistik', 'konsekvens', 'kallor', 'kalla', 'installningar',
]);

function allocateId(name: string): string {
  const base = slugify(name);
  // A tree called "Wedin" must not be handed the id the default tree already
  // answers to — it would become unreachable behind it.
  const taken = (id: string) => isDefaultId(id) || RESERVED.has(id) || fs.existsSync(fileFor(id));
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

/**
 * A tree with nobody in it yet, for building a family up by hand rather than
 * from a file. `createDb` runs the migrations, so the database is complete the
 * moment it exists — it simply has no rows.
 */
export function createEmptyTree(name: string): TreeInfo {
  const id = allocateId(name);
  fs.mkdirSync(treesDir(), { recursive: true });

  const db = createDb(fileFor(id));
  db.insert(treeMeta).values({
    id: 1,
    name: name.trim() || id,
    createdAt: new Date().toISOString(),
    sourceFile: null,          // nothing was imported; it starts empty
  }).run();
  db.$client.close();

  return infoFor(id);
}

export function renameTree(id: string, name: string): TreeInfo {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A family tree must have a name');
  const db = openTree(id);
  db.update(treeMeta).set({ name: trimmed }).where(eq(treeMeta.id, 1)).run();
  return infoFor(id);
}

export function setTreeFormat(id: string, format: '5.5.1' | '7.0'): TreeInfo {
  const db = openTree(id);
  db.update(treeMeta).set({ gedcomFormat: format }).where(eq(treeMeta.id, 1)).run();
  return infoFor(id);
}

export function deleteTree(id: string) {
  // Compared as a resolved path, not as a string. The default tree answers to
  // more than one name now, and a guard that checks the spelling rather than
  // the target is the same mistake that once let `..%2Fwedin` delete the
  // family database.
  const file = fileFor(id);
  if (fs.existsSync(defaultDbPath()) && path.resolve(file) === path.resolve(defaultDbPath())) {
    throw new Error('The original family tree cannot be removed');
  }
  if (!fs.existsSync(file)) throw new TreeNotFound(id);

  const db = open.get(file);
  if (db) {
    db.$client.close();
    open.delete(file);
  }
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  fs.rmSync(mediaDirFor(id), { recursive: true, force: true });
}
