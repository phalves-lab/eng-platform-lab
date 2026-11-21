import { z } from 'zod'

export const DocReviewStatusSchema = z.enum(['ok', 'expiring', 'stale', 'missing'])
export type DocReviewStatus = z.infer<typeof DocReviewStatusSchema>

/** A handbook file, or a standard with its own review fields, and how fresh its review is. */
export const DocReviewItemSchema = z.object({
  kind: z.enum(['document', 'standard']),
  ref: z.string(),
  title: z.string(),
  file: z.string(),
  owner: z.string().nullable(),
  reviewedAt: z.iso.date().nullable(),
  dueAt: z.iso.date().nullable(),
  ageDays: z.number().int().nullable(),
  status: DocReviewStatusSchema,
})
export type DocReviewItem = z.infer<typeof DocReviewItemSchema>

export const DocOwnerGroupSchema = z.object({
  owner: z.string().nullable(),
  items: z.array(DocReviewItemSchema),
  counts: z.record(DocReviewStatusSchema, z.number().int().nonnegative()),
})
export type DocOwnerGroup = z.infer<typeof DocOwnerGroupSchema>

export const DocsReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  maxAgeMonths: z.number().int().positive(),
  counts: z.record(DocReviewStatusSchema, z.number().int().nonnegative()),
  owners: z.array(DocOwnerGroupSchema),
})
export type DocsReport = z.infer<typeof DocsReportSchema>

export const DocsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional(),
})
export type DocsQuery = z.infer<typeof DocsQuerySchema>
