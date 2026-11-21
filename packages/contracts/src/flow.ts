import { z } from 'zod'

/** Workflow categories every Jira status maps to, in board column order. */
export const FlowCategorySchema = z.enum(['todo', 'in_progress', 'review', 'blocked', 'done'])
export type FlowCategory = z.infer<typeof FlowCategorySchema>

const projectKey = z.string().regex(/^[A-Z][A-Z0-9]+$/)
const days = z.number().nonnegative()

export const FlowMetricsQuerySchema = z.object({
  project: projectKey.optional(),
  component: z.string().trim().min(1).max(80).optional(),
  weeks: z.coerce.number().int().min(4).max(26).default(10),
})
export type FlowMetricsQuery = z.infer<typeof FlowMetricsQuerySchema>

/** Nearest-rank percentiles in days; null when no item qualifies. */
export const FlowPercentilesSchema = z.object({
  count: z.number().int().nonnegative(),
  p50: days.nullable(),
  p85: days.nullable(),
  p95: days.nullable(),
})
export type FlowPercentiles = z.infer<typeof FlowPercentilesSchema>

export const FlowItemSchema = z.object({
  key: z.string(),
  summary: z.string().nullable(),
  url: z.string().nullable(),
  project: z.string(),
  component: z.string().nullable(),
  status: z.string(),
  category: FlowCategorySchema,
})
export type FlowItem = z.infer<typeof FlowItemSchema>

export const AgingLevelSchema = z.enum(['ok', 'atencao', 'atrasado'])
export type AgingLevel = z.infer<typeof AgingLevelSchema>

/** Work in progress with its age; `atencao` above the cycle time p50 and `atrasado` above p85. */
export const AgingItemSchema = FlowItemSchema.extend({
  startedAt: z.iso.datetime(),
  ageDays: days,
  level: AgingLevelSchema,
})
export type AgingItem = z.infer<typeof AgingItemSchema>

export const BlockedItemSchema = FlowItemSchema.extend({
  blockedSince: z.iso.datetime(),
  blockedDays: days,
  totalBlockedDays: days,
})
export type BlockedItem = z.infer<typeof BlockedItemSchema>

export const CycleTimeBucketSchema = z.object({
  minDays: days,
  maxDays: days.nullable(),
  count: z.number().int().nonnegative(),
})
export type CycleTimeBucket = z.infer<typeof CycleTimeBucketSchema>

export const UnmappedStatusSchema = z.object({ project: z.string(), status: z.string() })
export type UnmappedStatus = z.infer<typeof UnmappedStatusSchema>

export const FlowMetricsResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  filter: z.object({
    project: z.string().nullable(),
    component: z.string().nullable(),
    weeks: z.number().int().positive(),
    from: z.iso.datetime(),
  }),
  options: z.object({ projects: z.array(z.string()), components: z.array(z.string()) }),
  throughput: z.array(
    z.object({ weekStart: z.iso.datetime(), delivered: z.number().int().nonnegative() }),
  ),
  cycleTime: FlowPercentilesSchema.extend({ distribution: z.array(CycleTimeBucketSchema) }),
  leadTime: FlowPercentilesSchema,
  wip: z.object({
    total: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  aging: z.array(AgingItemSchema),
  blocked: z.object({
    active: z.array(BlockedItemSchema),
    blockedDaysInWindow: days,
    itemsBlockedInWindow: z.number().int().nonnegative(),
  }),
  unmappedStatuses: z.array(UnmappedStatusSchema),
})
export type FlowMetricsResponse = z.infer<typeof FlowMetricsResponseSchema>

export const BoardCardSchema = FlowItemSchema.extend({
  epicKey: z.string().nullable(),
  enteredAt: z.iso.datetime(),
  daysInColumn: days,
})
export type BoardCard = z.infer<typeof BoardCardSchema>

export const BoardColumnSchema = z.object({
  category: FlowCategorySchema,
  label: z.string(),
  items: z.array(BoardCardSchema),
})
export type BoardColumn = z.infer<typeof BoardColumnSchema>

/** Items per category at the end of one day; `done` is cumulative. */
export const CfdPointSchema = z.object({
  day: z.iso.date(),
  todo: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
})
export type CfdPoint = z.infer<typeof CfdPointSchema>

/** Planned scope is what was in the sprint at its start; `added` came in later. */
export const SprintSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  state: z.enum(['future', 'active', 'closed']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  planned: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  deliveredPlanned: z.number().int().nonnegative(),
})
export type SprintSummary = z.infer<typeof SprintSummarySchema>

export const EpicProgressSchema = z.object({
  key: z.string(),
  summary: z.string().nullable(),
  url: z.string().nullable(),
  category: FlowCategorySchema,
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100).nullable(),
})
export type EpicProgress = z.infer<typeof EpicProgressSchema>

export const BoardResponseSchema = z.object({
  project: z.string(),
  generatedAt: z.iso.datetime(),
  doneWindowDays: z.number().int().positive(),
  columns: z.array(BoardColumnSchema),
  cfd: z.array(CfdPointSchema),
  sprints: z.array(SprintSummarySchema),
  epics: z.array(EpicProgressSchema),
  unmappedStatuses: z.array(UnmappedStatusSchema),
})
export type BoardResponse = z.infer<typeof BoardResponseSchema>

export const BoardSummarySchema = z.object({
  project: z.string(),
  items: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  activeSprint: z.string().nullable(),
})
export type BoardSummary = z.infer<typeof BoardSummarySchema>

export const BoardProjectParamSchema = projectKey
