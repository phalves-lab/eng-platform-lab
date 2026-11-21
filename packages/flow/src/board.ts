import type {
  BoardCard,
  BoardResponse,
  BoardSummary,
  CfdPoint,
  EpicProgress,
  SprintSummary,
} from '@lab/contracts'
import { toFlowItem } from './metrics.js'
import { DAY_MS, type FlowDataset, type FlowSprint, isEpic, toDays } from './model.js'
import { type Timeline, buildTimelines, categoryAt } from './timeline.js'
import { type Workflow, unmappedStatuses } from './workflow.js'

export const DONE_WINDOW_DAYS = 14
export const CFD_DAYS = 56
const PREVIOUS_SPRINTS = 3

export interface BoardInput {
  project: string
  dataset: FlowDataset
  workflow: Workflow
  now: Date
}

const card = (timeline: Timeline, now: number): BoardCard => {
  const enteredAt = timeline.segments.at(-1)?.from ?? timeline.createdAt
  return {
    ...toFlowItem(timeline),
    epicKey: timeline.issue.epicKey,
    enteredAt: new Date(enteredAt).toISOString(),
    daysInColumn: toDays(now - enteredAt),
  }
}

const startOfUtcDay = (time: number) => time - (time % DAY_MS)

/** One point per day over eight weeks, sampled at the end of each day (or now, for today). */
export const cumulativeFlow = (timelines: Timeline[], now: number): CfdPoint[] => {
  const today = startOfUtcDay(now)
  return Array.from({ length: CFD_DAYS }, (_, index) => {
    const day = today - (CFD_DAYS - 1 - index) * DAY_MS
    const at = Math.min(day + DAY_MS - 1, now)
    const point: CfdPoint = {
      day: new Date(day).toISOString().slice(0, 10),
      todo: 0,
      in_progress: 0,
      review: 0,
      blocked: 0,
      done: 0,
    }
    for (const timeline of timelines) {
      const category = categoryAt(timeline, at)
      if (category) point[category] += 1
    }
    return point
  })
}

/** The active sprint and the three closed before it, oldest first. */
export const recentSprints = (sprints: FlowSprint[]): (FlowSprint & { startsAt: string })[] => {
  const started = sprints
    .filter((sprint): sprint is FlowSprint & { startsAt: string } => sprint.startsAt !== null)
    .filter((sprint) => sprint.state !== 'future')
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
  const active = started.findLast((sprint) => sprint.state === 'active')
  const closed = started.filter(
    (sprint) => sprint.state === 'closed' && (!active || sprint.startsAt < active.startsAt),
  )
  return [
    ...closed.slice(active ? -PREVIOUS_SPRINTS : -(PREVIOUS_SPRINTS + 1)),
    ...(active ? [active] : []),
  ]
}

/**
 * Planned against delivered: an item counts as planned when it was in the sprint at the start,
 * and as delivered when it reached done between the start and the sprint close (now, if active).
 */
export const sprintSummaries = (
  input: Pick<FlowDataset, 'sprints' | 'sprintIssues'>,
  timelines: Map<string, Timeline>,
  now: number,
): SprintSummary[] =>
  recentSprints(input.sprints).map((sprint) => {
    const start = Date.parse(sprint.startsAt)
    const closedAt = sprint.completedAt ?? sprint.endsAt
    const end = sprint.state === 'active' || closedAt === null ? now : Date.parse(closedAt)
    const members = input.sprintIssues.filter(
      (entry) => entry.sprintId === sprint.id && timelines.has(entry.issueKey),
    )
    const planned = members.filter(
      (entry) => entry.addedAt === null || Date.parse(entry.addedAt) <= start,
    )
    const plannedKeys = new Set(planned.map((entry) => entry.issueKey))
    const delivered = members.filter((entry) => {
      const doneAt = timelines.get(entry.issueKey)?.doneAt ?? null
      return doneAt !== null && doneAt >= start && doneAt <= end
    })
    return {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startsAt: new Date(start).toISOString(),
      endsAt: sprint.endsAt === null ? null : new Date(Date.parse(sprint.endsAt)).toISOString(),
      planned: planned.length,
      added: members.length - planned.length,
      delivered: delivered.length,
      deliveredPlanned: delivered.filter((entry) => plannedKeys.has(entry.issueKey)).length,
    }
  })

export const epicProgress = (epics: Timeline[], work: Timeline[]): EpicProgress[] =>
  epics
    .map((epic) => {
      const children = work.filter((timeline) => timeline.issue.epicKey === epic.issue.key)
      const done = children.filter((timeline) => timeline.category === 'done').length
      return {
        key: epic.issue.key,
        summary: epic.issue.summary,
        url: epic.issue.url,
        category: epic.category,
        total: children.length,
        done,
        percent: children.length ? Math.round((done / children.length) * 100) : null,
      }
    })
    .toSorted(
      (a, b) =>
        Number(a.category === 'done') - Number(b.category === 'done') || a.key.localeCompare(b.key),
    )

/** Read-only board of one project: kanban by workflow column, CFD, sprints and epic progress. */
export const buildBoard = (input: BoardInput): BoardResponse => {
  const now = input.now.getTime()
  const issues = input.dataset.issues.filter((issue) => issue.project === input.project)
  const timelines = buildTimelines({ issues, changes: input.dataset.changes }, input.workflow)
  const work = timelines.filter((timeline) => !isEpic(timeline.issue))
  const recentDone = now - DONE_WINDOW_DAYS * DAY_MS
  const visible = work.filter(
    (timeline) => timeline.category !== 'done' || (timeline.doneAt ?? 0) >= recentDone,
  )
  return {
    project: input.project,
    generatedAt: input.now.toISOString(),
    doneWindowDays: DONE_WINDOW_DAYS,
    columns: input.workflow.columns.map((column) => ({
      category: column.id,
      label: column.label,
      items: visible
        .filter((timeline) => timeline.category === column.id)
        .map((timeline) => card(timeline, now))
        .toSorted((a, b) => b.daysInColumn - a.daysInColumn || a.key.localeCompare(b.key)),
    })),
    cfd: cumulativeFlow(work, now),
    sprints: sprintSummaries(
      {
        sprints: input.dataset.sprints.filter((sprint) => sprint.project === input.project),
        sprintIssues: input.dataset.sprintIssues,
      },
      new Map(work.map((timeline) => [timeline.issue.key, timeline])),
      now,
    ),
    epics: epicProgress(
      timelines.filter((timeline) => isEpic(timeline.issue)),
      work,
    ),
    unmappedStatuses: unmappedStatuses(input.workflow, issues),
  }
}

/** Projects in the mirror with their size, current WIP and active sprint, for the board picker. */
export const boardSummaries = (dataset: FlowDataset, workflow: Workflow): BoardSummary[] => {
  const work = buildTimelines(dataset, workflow).filter((timeline) => !isEpic(timeline.issue))
  const projects = [...new Set(work.map((timeline) => timeline.issue.project))].toSorted()
  return projects.map((project) => {
    const items = work.filter((timeline) => timeline.issue.project === project)
    const active = dataset.sprints.findLast(
      (sprint) => sprint.project === project && sprint.state === 'active',
    )
    return {
      project,
      items: items.length,
      inProgress: items.filter((timeline) =>
        ['in_progress', 'review', 'blocked'].includes(timeline.category),
      ).length,
      activeSprint: active?.name ?? null,
    }
  })
}
