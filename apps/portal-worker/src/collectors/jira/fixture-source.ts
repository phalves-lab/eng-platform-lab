import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JiraIssue, JiraSprintIssue, JiraStatusChange } from '@lab/database'
import { z } from 'zod'
import type { JiraBatch, JiraSource } from './source.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const isoDateTime = z.iso.datetime({ offset: true })

const BoardFileSchema = z.object({
  project: z.string().regex(/^[A-Z][A-Z0-9]+$/),
  name: z.string().min(1),
  boardId: z.number().int().positive(),
  site: z.url({ protocol: /^https$/ }),
  anchor: isoDateTime,
  initialStatus: z.string().min(1),
  sprints: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      state: z.enum(['future', 'active', 'closed']),
      startsAt: isoDateTime.nullable(),
      endsAt: isoDateTime.nullable(),
      completedAt: isoDateTime.nullable(),
    }),
  ),
  issues: z.array(
    z.object({
      key: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/),
      type: z.string().min(1),
      summary: z.string().min(1),
      component: z.string().min(1).nullable(),
      epic: z.string().nullable(),
      assignee: z.string().min(1).nullable(),
      createdAt: isoDateTime,
      resolvedAt: isoDateTime.nullable(),
      history: z.array(z.object({ to: z.string().min(1), at: isoDateTime })),
      sprints: z.array(z.object({ id: z.number().int().positive(), addedAt: isoDateTime })),
    }),
  ),
})
type BoardFile = z.infer<typeof BoardFileSchema>

export interface FixtureJiraSourceOptions {
  dir: string
  /** Shifts every date by whole weeks so the newest data lands in the current week. */
  rebase: boolean
}

const shifter = (anchor: string, now: Date, rebase: boolean) => {
  const weeks = rebase ? Math.floor((now.getTime() - Date.parse(anchor)) / WEEK_MS) : 0
  const offset = weeks * WEEK_MS
  const shift = (iso: string) => new Date(Date.parse(iso) + offset).toISOString()
  const shiftOrNull = (iso: string | null) => (iso === null ? null : shift(iso))
  return { shift, shiftOrNull }
}

const toBatch = (board: BoardFile, now: Date, rebase: boolean): JiraBatch => {
  const { shift, shiftOrNull } = shifter(board.anchor, now, rebase)
  const issues: JiraIssue[] = []
  const changes: JiraStatusChange[] = []
  const sprintIssues: JiraSprintIssue[] = []
  for (const item of board.issues) {
    let status = board.initialStatus
    for (const step of item.history) {
      changes.push({
        issueKey: item.key,
        fromStatus: status,
        toStatus: step.to,
        changedAt: shift(step.at),
      })
      status = step.to
    }
    for (const sprint of item.sprints) {
      sprintIssues.push({ sprintId: sprint.id, issueKey: item.key, addedAt: shift(sprint.addedAt) })
    }
    issues.push({
      key: item.key,
      project: board.project,
      component: item.component,
      issueType: item.type,
      status,
      summary: item.summary,
      url: `${board.site}/browse/${item.key}`,
      epicKey: item.epic,
      sprintId: item.sprints.at(-1)?.id ?? null,
      assignee: item.assignee,
      createdAt: shift(item.createdAt),
      resolvedAt: shiftOrNull(item.resolvedAt),
    })
  }
  return {
    sprints: board.sprints.map((sprint) => ({
      ...sprint,
      project: board.project,
      startsAt: shiftOrNull(sprint.startsAt),
      endsAt: shiftOrNull(sprint.endsAt),
      completedAt: shiftOrNull(sprint.completedAt),
    })),
    issues,
    changes,
    sprintIssues,
  }
}

const readBoard = async (path: string): Promise<BoardFile> => {
  const parsed = BoardFileSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success) {
    throw new Error(
      `Invalid Jira fixture ${path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    )
  }
  return parsed.data
}

/** Synthetic boards from `fixtures/jira-board/*.json`, one file per project. */
export const createFixtureJiraSource = (options: FixtureJiraSourceOptions): JiraSource => ({
  kind: 'fixture',
  fetch: async (now) => {
    const files = (await readdir(options.dir)).filter((file) => file.endsWith('.json')).sort()
    if (files.length === 0) throw new Error(`No Jira fixtures in ${options.dir}`)
    const batches = await Promise.all(
      files.map(async (file) =>
        toBatch(await readBoard(join(options.dir, file)), now, options.rebase),
      ),
    )
    return {
      sprints: batches.flatMap((batch) => batch.sprints),
      issues: batches.flatMap((batch) => batch.issues),
      changes: batches.flatMap((batch) => batch.changes),
      sprintIssues: batches.flatMap((batch) => batch.sprintIssues),
    }
  },
})
