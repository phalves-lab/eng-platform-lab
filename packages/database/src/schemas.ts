import { z } from 'zod'

const isoDateTime = z.iso.datetime({ offset: true })
const nullableNumber = z.number().nullable()
const issueKey = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/)

const QueueRowSchema = z.object({
  position: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  taskKey: z.string().nullable(),
  taskStatus: z.string().nullable(),
  requestedReviewers: z.array(z.string()),
  reviewedBy: z.array(z.string()),
  enteredAt: z.string(),
  enteredFrom: z.enum(['jira', 'pr']),
  ageBusinessDays: z.number(),
  level: z.enum(['ok', 'atencao', 'atrasado']),
  hasHumanReview: z.boolean(),
  checks: z.enum(['SUCCESS', 'FAILURE', 'PENDING', 'ERROR', 'EXPECTED']).nullable(),
  botSignal: z.enum(['ajustes', 'gate', 'pronto']).nullable(),
  risks: z.array(z.string()),
  lines: z.number().int(),
})

const AlertSchema = z.object({
  kind: z.string(),
  severity: z.enum(['alta', 'media']),
  subject: z.string(),
  message: z.string(),
  url: z.string().nullable(),
})

const TeamMetricsSchema = z.object({
  windowDays: z.number().int(),
  merged: z.number().int(),
  medianHoursToFirstReview: nullableNumber,
  medianBusinessDaysToMerge: nullableNumber,
  medianSize: nullableNumber,
  mergedWithFailingChecks: z.number().int(),
  signals: z.object({
    ajustes: z.number().int(),
    gate: z.number().int(),
    pronto: z.number().int(),
    sem_comentario: z.number().int(),
  }),
  reviewers: z.array(
    z.object({
      reviewer: z.string(),
      reviews: z.number().int(),
      pullRequests: z.number().int(),
      comments: z.number().int(),
    }),
  ),
  pairs: z.array(z.object({ author: z.string(), reviewer: z.string(), count: z.number().int() })),
})

/** Shape of one panel dataset as computed by the eng-metrics collector. */
export const SnapshotPayloadSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  title: z.string(),
  label: z.string(),
  generatedAt: isoDateTime,
  queue: z.array(QueueRowSchema),
  alerts: z.array(AlertSchema),
  metrics: TeamMetricsSchema,
  trend: z.array(
    z.object({
      weekStart: z.string(),
      merged: z.number().int(),
      medianHoursToFirstReview: nullableNumber,
      medianSize: nullableNumber,
    }),
  ),
})
export type SnapshotPayload = z.infer<typeof SnapshotPayloadSchema>

export const MetricSnapshotSchema = z.object({
  dataset: z.string(),
  day: z.iso.date(),
  payload: SnapshotPayloadSchema,
  collectedAt: isoDateTime,
})
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>

export const JiraSprintSchema = z.object({
  id: z.number().int().positive(),
  project: z.string().min(1),
  name: z.string().min(1),
  state: z.enum(['future', 'active', 'closed']),
  startsAt: isoDateTime.nullable(),
  endsAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
})
export type JiraSprint = z.infer<typeof JiraSprintSchema>

export const JiraIssueSchema = z.object({
  key: issueKey,
  project: z.string().min(1),
  component: z.string().min(1).nullable(),
  issueType: z.string().min(1),
  status: z.string().min(1),
  epicKey: issueKey.nullable(),
  sprintId: z.number().int().positive().nullable(),
  assignee: z.string().min(1).nullable(),
  createdAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
})
export type JiraIssue = z.infer<typeof JiraIssueSchema>

export const JiraStatusChangeSchema = z.object({
  issueKey,
  fromStatus: z.string().min(1).nullable(),
  toStatus: z.string().min(1),
  changedAt: isoDateTime,
})
export type JiraStatusChange = z.infer<typeof JiraStatusChangeSchema>

export const DeploySchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  environment: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/),
  deployedAt: isoDateTime,
  status: z.enum(['success', 'failure', 'rolled_back']),
})
export type Deploy = z.infer<typeof DeploySchema>

export const IncidentSchema = z.object({
  id: z.string().min(1),
  system: z.string().min(1),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
})
export type Incident = z.infer<typeof IncidentSchema>
