import { z } from 'zod';

// Shared between API (server-side validation) and UI forms (client-side) —
// spec §9: all mutations validated with shared zod schemas.

export const sexSchema = z.enum(['M', 'F', 'U']);

export const personUpdateSchema = z.object({
  givenName: z.string().trim().max(120),
  surname: z.string().trim().max(120),
  marriedName: z.string().trim().max(120).nullable(),
  suffix: z.string().trim().max(60).nullable(),
  sex: sexSchema,
  note: z.string().trim().max(10_000).nullable(),
}).partial();
export type PersonUpdate = z.infer<typeof personUpdateSchema>;

export const eventFieldsSchema = z.object({
  dateRaw: z.string().trim().max(60).nullable(),
  place: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(500).nullable(),
  age: z.string().trim().max(30).nullable(),
});
export const eventCreateSchema = eventFieldsSchema.extend({
  type: z.string().trim().regex(/^[A-Z][A-Z_]{1,11}$/, 'Unknown event type'),
  ownerType: z.enum(['person', 'family']),
  ownerId: z.string().trim().min(2),
});
export const eventUpdateSchema = eventFieldsSchema.partial();
export type EventCreate = z.infer<typeof eventCreateSchema>;
export type EventUpdate = z.infer<typeof eventUpdateSchema>;

export const newPersonSchema = z.object({
  givenName: z.string().trim().min(1, 'A first name is required').max(120),
  surname: z.string().trim().max(120).default(''),
  sex: sexSchema.default('U'),
});
export type NewPerson = z.infer<typeof newPersonSchema>;

export const sourceUpdateSchema = z.object({
  title: z.string().trim().max(200).nullable(),
  author: z.string().trim().max(200).nullable(),
  publication: z.string().trim().max(200).nullable(),
  // A whole document, not a line: room for a page of close handwriting.
  transcription: z.string().max(20_000).nullable(),
  note: z.string().trim().max(10_000).nullable(),
}).partial();
export type SourceUpdate = z.infer<typeof sourceUpdateSchema>;

export const citationCreateSchema = z.object({
  // Person-level for now: every one of the 5 804 imported citations is, and
  // citing a single fact needs its own affordance on every event row.
  ownerType: z.literal('person'),
  ownerId: z.string().trim().min(2),
  sourceId: z.string().trim().min(2),
  page: z.string().trim().max(200).nullable().optional(),
  /** GEDCOM QUAY: 0 unreliable … 3 primary evidence. */
  quality: z.number().int().min(0).max(3).nullable().optional(),
  // The passage naming this person — what makes a citation worth having rather
  // than a pointer at a whole document.
  text: z.string().max(5_000).nullable().optional(),
});
export type CitationCreate = z.infer<typeof citationCreateSchema>;

const fieldChoice = z.enum(['survivor', 'duplicate']);

export const mergeSchema = z.object({
  survivorId: z.string().trim().min(2),
  duplicateId: z.string().trim().min(2),
  // A partial object, not z.record(enum, …): zod requires every key of an enum
  // keyed record, which would reject the UI's "keep all survivor values" case.
  fieldChoices: z.object({
    givenName: fieldChoice,
    surname: fieldChoice,
    marriedName: fieldChoice,
    suffix: fieldChoice,
    sex: fieldChoice,
    note: fieldChoice,
  }).partial().optional(),
});
export type MergeRequest = z.infer<typeof mergeSchema>;

export const relationSchema = z.object({
  type: z.enum(['child', 'spouse', 'parent']),
  personId: z.string().trim().min(2),
  relativeId: z.string().trim().min(2).optional(),
  newPerson: newPersonSchema.optional(),
  familyId: z.string().trim().min(2).optional(),
}).refine(v => (v.relativeId ? 1 : 0) + (v.newPerson ? 1 : 0) === 1, {
  message: 'Ange antingen en befintlig person eller en ny person',
});
export type RelationInput = z.infer<typeof relationSchema>;
