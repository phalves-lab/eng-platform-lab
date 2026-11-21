import { z } from 'zod'
import { FlowItemSchema } from './flow.js'

const teamId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const account = z.string().trim().min(1).nullable().default(null)
const count = z.number().int().nonnegative()

export const PersonRoleSchema = z.enum(['dev', 'lead'])
export type PersonRole = z.infer<typeof PersonRoleSchema>

/**
 * One file of `catalog/people/`: a team and its people. `jira` is the assignee as the Jira mirror
 * stores it and `github` the login that opens and reviews PRs; either may be missing.
 */
export const PeopleFileSchema = z.object({
  team: teamId,
  name: z.string().trim().min(1),
  people: z
    .array(
      z.object({
        login: z.string().trim().min(1),
        name: z.string().trim().min(1),
        jira: account,
        github: account,
        role: PersonRoleSchema.default('dev'),
      }),
    )
    .min(1),
})
export type PeopleFile = z.infer<typeof PeopleFileSchema>

export const TeamRefSchema = z.object({ id: teamId, name: z.string() })
export type TeamRef = z.infer<typeof TeamRefSchema>

export const PersonSchema = z.object({
  login: z.string(),
  name: z.string(),
  jira: z.string().nullable(),
  github: z.string().nullable(),
  role: PersonRoleSchema,
  team: TeamRefSchema,
})
export type Person = z.infer<typeof PersonSchema>

const staleDays = z.coerce.number().int().min(1).max(30).optional()

export const MyWorkQuerySchema = z.object({
  dataset: z.string().trim().min(1).default('lab'),
  staleDays,
})
export type MyWorkQuery = z.infer<typeof MyWorkQuerySchema>

export const TeamWorkQuerySchema = MyWorkQuerySchema.extend({ team: teamId.optional() })
export type TeamWorkQuery = z.infer<typeof TeamWorkQuerySchema>

/** Open Jira item with the time since its last status change, in business days. */
export const WorkItemSchema = FlowItemSchema.extend({
  since: z.iso.datetime(),
  idleBusinessDays: z.number().nonnegative(),
  stale: z.boolean(),
})
export type WorkItem = z.infer<typeof WorkItemSchema>

/** Someone else's item waiting on one of mine. */
export const BlockedByMeSchema = FlowItemSchema.extend({
  assignee: z.string().nullable(),
  blocker: FlowItemSchema,
})
export type BlockedByMe = z.infer<typeof BlockedByMeSchema>

export const JiraUnavailableReasonSchema = z.enum([
  'no_database',
  'not_collected',
  'unknown_person',
  'no_jira_account',
])
export type JiraUnavailableReason = z.infer<typeof JiraUnavailableReasonSchema>

const JiraUnavailableSchema = z.object({
  state: z.literal('unavailable'),
  reason: JiraUnavailableReasonSchema,
})

export const MyJiraWorkSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    inProgress: z.array(WorkItemSchema),
    review: z.array(WorkItemSchema),
    blocked: z.array(WorkItemSchema),
    stale: z.array(WorkItemSchema),
    blockedByMe: z.array(BlockedByMeSchema),
  }),
  JiraUnavailableSchema,
])
export type MyJiraWork = z.infer<typeof MyJiraWorkSchema>

export const ReviewRequestSchema = z.object({
  position: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  ageBusinessDays: z.number(),
  level: z.enum(['ok', 'atencao', 'atrasado']),
  lines: z.number().int(),
})
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>

export const PrStatusKindSchema = z.enum([
  'failing_checks',
  'bot_changes',
  'awaiting_review',
  'reviewed',
  'no_reviewer',
])
export type PrStatusKind = z.infer<typeof PrStatusKindSchema>

export const MyPullRequestSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  status: z.object({
    kind: PrStatusKindSchema,
    label: z.string(),
    tone: z.enum(['success', 'warning', 'destructive', 'secondary']),
    hint: z.string(),
    needsAction: z.boolean(),
  }),
})
export type MyPullRequest = z.infer<typeof MyPullRequestSchema>

export const MyReviewWorkSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    dataset: z.string(),
    github: z.string(),
    toReview: z.array(ReviewRequestSchema),
    mine: z.array(MyPullRequestSchema),
    changesRequested: z.array(MyPullRequestSchema),
  }),
  z.object({
    state: z.literal('unavailable'),
    reason: z.enum(['not_collected', 'no_github_account']),
  }),
])
export type MyReviewWork = z.infer<typeof MyReviewWorkSchema>

export const WorkAlertSchema = z.object({
  kind: z.enum(['stale_task', 'blocked_task', 'blocking_others', 'late_review', 'failing_checks']),
  severity: z.enum(['alta', 'media']),
  message: z.string(),
  url: z.string().nullable(),
})
export type WorkAlert = z.infer<typeof WorkAlertSchema>

export const MyWorkResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  login: z.string(),
  person: PersonSchema.nullable(),
  staleAfterBusinessDays: z.number().int().positive(),
  jira: MyJiraWorkSchema,
  review: MyReviewWorkSchema,
  alerts: z.array(WorkAlertSchema),
})
export type MyWorkResponse = z.infer<typeof MyWorkResponseSchema>

/** Load of one person, in alphabetical order: there is no score, rank or productivity order. */
export const TeamMemberLoadSchema = z.object({
  login: z.string(),
  name: z.string(),
  role: PersonRoleSchema,
  jira: z.object({ inProgress: count, review: count, blocked: count, stale: count }).nullable(),
  pendingReviews: count.nullable(),
})
export type TeamMemberLoad = z.infer<typeof TeamMemberLoadSchema>

export const TeamStaleItemSchema = WorkItemSchema.extend({ assignee: z.string() })
export type TeamStaleItem = z.infer<typeof TeamStaleItemSchema>

export const TeamWorkResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  team: TeamRefSchema,
  teams: z.array(TeamRefSchema),
  staleAfterBusinessDays: z.number().int().positive(),
  jira: z.discriminatedUnion('state', [
    z.object({ state: z.literal('ready'), staleItems: z.array(TeamStaleItemSchema) }),
    JiraUnavailableSchema,
  ]),
  review: z.object({ state: z.enum(['ready', 'unavailable']) }),
  members: z.array(TeamMemberLoadSchema),
})
export type TeamWorkResponse = z.infer<typeof TeamWorkResponseSchema>
