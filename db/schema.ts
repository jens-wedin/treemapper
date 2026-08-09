import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * What this database calls itself. One row, id 1.
 *
 * A tree's name lives inside the tree rather than in a central registry, so
 * there is nothing to drift out of sync, corrupt, or lose when a .db file is
 * copied around. Listing the trees is a directory scan plus one row per file.
 */
export const treeMeta = sqliteTable('tree_meta', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  sourceFile: text('source_file'),                   // uploaded filename, null for the default tree
  // How this tree is addressed in a URL. Taken from the database's filename
  // rather than the display name, so renaming a tree never breaks a link
  // somebody saved. Empty on rows written before slugs existed; backfilled on
  // first open.
  slug: text('slug').notNull().default(''),
});

export const persons = sqliteTable('persons', {
  id: text('id').primaryKey(),                       // GEDCOM xref, e.g. I500001
  givenName: text('given_name').notNull().default(''),
  surname: text('surname').notNull().default(''),
  marriedName: text('married_name'),
  suffix: text('suffix'),
  sex: text('sex', { enum: ['M', 'F', 'U'] }).notNull().default('U'),
  note: text('note'),
  rawTags: text('raw_tags'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const families = sqliteTable('families', {
  id: text('id').primaryKey(),                       // F500001
  husbandId: text('husband_id'),
  wifeId: text('wife_id'),
  note: text('note'),
  rawTags: text('raw_tags'),
});

export const familyChildren = sqliteTable('family_children', {
  id: integer('id').primaryKey(),
  familyId: text('family_id').notNull(),
  childId: text('child_id').notNull(),
  seq: integer('seq').notNull(),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey(),                    // assigned by mapper
  ownerType: text('owner_type', { enum: ['person', 'family'] }).notNull(),
  ownerId: text('owner_id').notNull(),
  type: text('type').notNull(),                      // GEDCOM tag: BIRT, DEAT, MARR, RESI…
  dateRaw: text('date_raw'),                         // verbatim: "ABT 1715", "BEF 1789"
  dateYear: integer('date_year'),                    // parsed, nullable
  place: text('place'),
  description: text('description'),
  age: text('age'),
  rawTags: text('raw_tags'),
});

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),                       // S…
  title: text('title'),
  author: text('author'),
  publication: text('publication'),
  note: text('note'),
  rawTags: text('raw_tags'),
});

export const citations = sqliteTable('citations', {
  id: integer('id').primaryKey(),                    // assigned by mapper
  ownerType: text('owner_type', { enum: ['event', 'person', 'family'] }).notNull(),
  ownerId: text('owner_id').notNull(),               // event id (as string) or xref
  sourceId: text('source_id').notNull(),
  page: text('page'),
  quality: integer('quality'),                       // QUAY 0–3
  text: text('text'),
  rawTags: text('raw_tags'),
});

export const media = sqliteTable('media', {
  id: integer('id').primaryKey(),                    // assigned by mapper
  ownerType: text('owner_type', { enum: ['person', 'family'] }).notNull(),
  ownerId: text('owner_id').notNull(),
  title: text('title'),
  originalUrl: text('original_url').notNull(),
  form: text('form'),                                // jpg, png…
  filesize: integer('filesize'),
  localPath: text('local_path'),
  downloadStatus: text('download_status', { enum: ['pending', 'done', 'failed'] }).notNull().default('pending'),
  downloadedAt: text('downloaded_at'),
  rawTags: text('raw_tags'),
});

export const issueDismissals = sqliteTable('issue_dismissals', {
  fingerprint: text('fingerprint').primaryKey(),
  dismissedAt: text('dismissed_at').notNull(),
  note: text('note'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  action: text('action', { enum: ['create', 'update', 'delete', 'merge', 'import'] }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  before: text('before'),
  after: text('after'),
});
