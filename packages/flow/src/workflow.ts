import { readFile } from 'node:fs/promises'
import { type FlowCategory, FlowCategorySchema, type UnmappedStatus } from '@lab/contracts'
import { parse } from 'yaml'
import { z } from 'zod'

const StatusListSchema = z.array(z.string().trim().min(1))

const WorkflowFileSchema = z.object({
  categories: z
    .array(
      z.object({
        id: FlowCategorySchema,
        label: z.string().trim().min(1),
        statuses: StatusListSchema,
      }),
    )
    .refine(
      (categories) =>
        categories.length === FlowCategorySchema.options.length &&
        new Set(categories.map((category) => category.id)).size === categories.length,
      { message: `categories must list each of ${FlowCategorySchema.options.join(', ')} once` },
    ),
  projects: z
    .record(
      z.string().regex(/^[A-Z][A-Z0-9]+$/),
      z.partialRecord(FlowCategorySchema, StatusListSchema),
    )
    .default({}),
})

export interface WorkflowColumn {
  id: FlowCategory
  label: string
}

/** Status to category mapping read from `catalog/jira/workflow.yaml`, with per-project additions. */
export interface Workflow {
  columns: WorkflowColumn[]
  classify: (project: string, status: string) => FlowCategory | null
}

const normalize = (status: string) => status.trim().toLocaleLowerCase('pt-BR')

const indexStatuses = (
  entries: [FlowCategory, string[]][],
  scope: string,
  into = new Map<string, FlowCategory>(),
) => {
  for (const [category, statuses] of entries) {
    for (const status of statuses) {
      const key = normalize(status)
      const previous = into.get(key)
      if (previous && previous !== category) {
        throw new Error(`Status "${status}" maps to ${previous} and ${category} in ${scope}`)
      }
      into.set(key, category)
    }
  }
  return into
}

/** Validates the workflow file and fails on statuses claimed by two categories. */
export const parseWorkflow = (text: string): Workflow => {
  const parsed = WorkflowFileSchema.safeParse(parse(text))
  if (!parsed.success) {
    throw new Error(
      `Invalid workflow: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    )
  }
  const { categories, projects } = parsed.data
  const shared = indexStatuses(
    categories.map((category) => [category.id, category.statuses]),
    'the shared workflow',
  )
  const perProject = new Map(
    Object.entries(projects).map(([project, extra]) => [
      project,
      indexStatuses(
        FlowCategorySchema.options.flatMap((category): [FlowCategory, string[]][] => {
          const statuses = extra[category]
          return statuses ? [[category, statuses]] : []
        }),
        project,
        new Map(shared),
      ),
    ]),
  )
  return {
    columns: categories.map(({ id, label }) => ({ id, label })),
    classify: (project, status) =>
      (perProject.get(project) ?? shared).get(normalize(status)) ?? null,
  }
}

export const loadWorkflow = async (path: string): Promise<Workflow> =>
  parseWorkflow(await readFile(path, 'utf8'))

/** Distinct project and status pairs the workflow does not know, so the collector can warn. */
export const unmappedStatuses = (
  workflow: Workflow,
  items: { project: string; status: string }[],
): UnmappedStatus[] => {
  const seen = new Map<string, UnmappedStatus>()
  for (const { project, status } of items) {
    if (workflow.classify(project, status) !== null) continue
    seen.set(`${project}\u0000${status}`, { project, status })
  }
  return [...seen.values()]
}
