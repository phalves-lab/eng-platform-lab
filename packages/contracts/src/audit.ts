import { z } from 'zod'
import { PortalRoleSchema } from './auth.js'

export const AuditKindSchema = z.enum(['write', 'read'])
export type AuditKind = z.infer<typeof AuditKindSchema>

export const AuditOutcomeSchema = z.enum(['success', 'denied', 'failed'])
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>

/** One line of the audit trail: who did what, on which target, when, with which outcome. */
export const AuditEntrySchema = z.object({
  id: z.number().int().positive(),
  at: z.iso.datetime({ offset: true }),
  actor: z.string(),
  role: PortalRoleSchema,
  action: z.string(),
  kind: AuditKindSchema,
  target: z.string().nullable(),
  outcome: AuditOutcomeSchema,
  status: z.number().int(),
  ipPrefix: z.string().nullable(),
  releaseRunId: z.number().int().positive().nullable(),
})
export type AuditEntry = z.infer<typeof AuditEntrySchema>

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).max(200).optional(),
)

export const AuditQuerySchema = z
  .object({
    actor: optionalText,
    action: optionalText,
    kind: z.preprocess((value) => (value === '' ? undefined : value), AuditKindSchema.optional()),
    outcome: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AuditOutcomeSchema.optional(),
    ),
    from: z.preprocess((value) => (value === '' ? undefined : value), z.iso.date().optional()),
    to: z.preprocess((value) => (value === '' ? undefined : value), z.iso.date().optional()),
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must not be after to',
  })
export type AuditQuery = z.infer<typeof AuditQuerySchema>

export const AuditPageSchema = z.object({
  entries: z.array(AuditEntrySchema),
  nextBefore: z.number().int().positive().nullable(),
})
export type AuditPage = z.infer<typeof AuditPageSchema>
