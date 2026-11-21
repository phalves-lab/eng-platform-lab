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
  summary: z.string().min(1).nullable(),
  url: z.url({ protocol: /^https$/ }).nullable(),
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

/** Membership of an issue in a sprint; `addedAt` after the sprint start means scope added late. */
export const JiraSprintIssueSchema = z.object({
  sprintId: z.number().int().positive(),
  issueKey,
  addedAt: isoDateTime.nullable(),
})
export type JiraSprintIssue = z.infer<typeof JiraSprintIssueSchema>

/** Jira "is blocked by" link: `blockedKey` waits on `blockerKey`. */
export const JiraIssueLinkSchema = z
  .object({ blockedKey: issueKey, blockerKey: issueKey })
  .refine((link) => link.blockedKey !== link.blockerKey, {
    message: 'an issue cannot block itself',
  })
export type JiraIssueLink = z.infer<typeof JiraIssueLinkSchema>

const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/)
const commitSha = z.string().regex(/^[0-9a-f]{7,40}$/)

/** `commitShas` lists the commits a deploy shipped for the first time, used to match changes. */
export const DeploySchema = z.object({
  repo: repoName,
  environment: z.string().min(1),
  sha: commitSha,
  deployedAt: isoDateTime,
  status: z.enum(['success', 'failure', 'rolled_back']),
  url: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .default(null),
  commitShas: z.array(commitSha).default([]),
})
export type Deploy = z.infer<typeof DeploySchema>
export type DeployInput = z.input<typeof DeploySchema>

export const IncidentSchema = z.object({
  id: z.string().min(1),
  system: z.string().min(1),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
  title: z.string().min(1).nullable().default(null),
  cause: z.object({ repo: repoName, sha: commitSha }).nullable().default(null),
})
export type Incident = z.infer<typeof IncidentSchema>
export type IncidentInput = z.input<typeof IncidentSchema>

/** A merged pull request: lead time runs from its first commit to the deploy that ships it. */
export const ChangeSchema = z.object({
  repo: repoName,
  pullNumber: z.number().int().positive(),
  title: z.string().default(''),
  mergeSha: commitSha,
  firstCommitAt: isoDateTime,
  mergedAt: isoDateTime,
})
export type Change = z.infer<typeof ChangeSchema>
export type ChangeInput = z.input<typeof ChangeSchema>
