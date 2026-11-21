import { z } from 'zod'
import { DoraDeploySchema, DoraRepoSummarySchema } from './dora.js'
import { FlowCategorySchema, FlowItemSchema } from './flow.js'

const repoName = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'repositório deve estar no formato owner/name')
const issueKey = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9]+-\d+$/, 'chave do Jira no formato ABC-123')
const count = z.number().int().nonnegative()

export const ProjectStatusSchema = z.enum(['planned', 'active', 'at_risk', 'paused', 'done'])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const ProjectRiskSeveritySchema = z.enum(['high', 'medium', 'low'])
export type ProjectRiskSeverity = z.infer<typeof ProjectRiskSeveritySchema>

export const ProjectRiskSchema = z.strictObject({
  title: z.string().trim().min(1),
  severity: ProjectRiskSeveritySchema,
  mitigation: z.string().trim().min(1).nullable().default(null),
})
export type ProjectRisk = z.infer<typeof ProjectRiskSchema>

/**
 * Project as declared in `catalog/projects/*.yaml`. `systems` are handbook system names or
 * slugs and `decisions` are pending decision or standard IDs of the handbook.
 */
export const ProjectEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id em kebab-case'),
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  status: ProjectStatusSchema,
  owner: z.string().trim().min(1),
  epic: issueKey.nullable().default(null),
  repos: z.array(repoName).default([]),
  systems: z.array(z.string().trim().min(1)).default([]),
  decisions: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(ProjectRiskSchema).default([]),
})
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>

export const ProjectIdParamSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)

export const ProjectListQuerySchema = z.object({
  term: z.string().trim().min(1).max(80).optional(),
})
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>

/** Whether each crossed source answered; `unavailable` means it has no data yet. */
export const ProjectSourceStateSchema = z.enum(['ok', 'unavailable'])
export type ProjectSourceState = z.infer<typeof ProjectSourceStateSchema>

export const ProjectSourcesSchema = z.object({
  jira: ProjectSourceStateSchema,
  pullRequests: ProjectSourceStateSchema,
})
export type ProjectSources = z.infer<typeof ProjectSourcesSchema>

/** Epic progress in the Jira mirror; epics themselves are not counted as items. */
export const ProjectEpicSchema = z.object({
  key: z.string(),
  summary: z.string().nullable(),
  url: z.string().nullable(),
  category: FlowCategorySchema,
  total: count,
  done: count,
  open: count,
  blocked: count,
  percent: z.number().int().min(0).max(100).nullable(),
})
export type ProjectEpic = z.infer<typeof ProjectEpicSchema>

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  status: ProjectStatusSchema,
  owner: z.string(),
  epicKey: z.string().nullable(),
  repos: z.array(z.string()),
  epic: ProjectEpicSchema.nullable(),
  openPullRequests: count.nullable(),
  sources: ProjectSourcesSchema,
})
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export const ProjectPullRequestSchema = z.object({
  repo: z.string().nullable(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().nullable(),
  author: z.string().nullable(),
  taskKey: z.string().nullable(),
  state: z.enum(['open', 'merged']),
  at: z.iso.datetime(),
})
export type ProjectPullRequest = z.infer<typeof ProjectPullRequestSchema>

/** Handbook system linked to the project; `slug` is null when no card has that name. */
export const ProjectSystemSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
  status: z.string().nullable(),
  owner: z.string().nullable(),
  summary: z.string().nullable(),
})
export type ProjectSystem = z.infer<typeof ProjectSystemSchema>

/** Pending decision or standard linked to the project; `kind` is `unknown` when not found. */
export const ProjectDecisionSchema = z.object({
  id: z.string(),
  kind: z.enum(['decision', 'standard', 'unknown']),
  title: z.string().nullable(),
  detail: z.string().nullable(),
  priority: z.number().int().nullable(),
})
export type ProjectDecision = z.infer<typeof ProjectDecisionSchema>

export const ProjectDetailSchema = ProjectSummarySchema.extend({
  sources: ProjectSourcesSchema.extend({ dora: ProjectSourceStateSchema }),
  generatedAt: z.iso.datetime(),
  windowWeeks: z.number().int().positive(),
  tasks: z.array(FlowItemSchema),
  pullRequests: z.object({
    open: z.array(ProjectPullRequestSchema),
    merged: z.array(ProjectPullRequestSchema),
  }),
  deploys: z.array(DoraDeploySchema),
  dora: z.array(DoraRepoSummarySchema),
  systems: z.array(ProjectSystemSchema),
  decisions: z.array(ProjectDecisionSchema),
  risks: z.array(ProjectRiskSchema),
})
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>
