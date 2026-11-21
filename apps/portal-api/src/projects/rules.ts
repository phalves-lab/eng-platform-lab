import type {
  DoraDeploy,
  DoraMetricsResponse,
  DoraRepoSummary,
  FlowCategory,
  FlowItem,
  ProjectDecision,
  ProjectEntry,
  ProjectEpic,
  ProjectPullRequest,
  ProjectSystem,
} from '@lab/contracts'
import type { Change } from '@lab/database'
import type { PanelData } from '@lab/eng-metrics/contract'
import { type Handbook, findStandard, normalize, slugify } from '@lab/handbook'
import {
  type FlowDataset,
  type Timeline,
  type Workflow,
  buildTimelines,
  epicProgress,
} from '@lab/flow'

export const LIST_LIMIT = 10

const TASK_ORDER: FlowCategory[] = ['blocked', 'in_progress', 'review', 'todo', 'done']
const PULL_URL = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/\d+/i
const TASK_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/

export interface EpicView {
  epic: ProjectEpic
  tasks: FlowItem[]
}

/** Jira project of an issue key, such as `LAB` for `LAB-201`. */
export const projectOfKey = (key: string) => key.slice(0, key.lastIndexOf('-'))

const toItem = (timeline: Timeline): FlowItem => ({
  key: timeline.issue.key,
  summary: timeline.issue.summary,
  url: timeline.issue.url,
  project: timeline.issue.project,
  component: timeline.issue.component,
  status: timeline.issue.status,
  category: timeline.category,
})

const byKeyNumber = (a: FlowItem, b: FlowItem) =>
  Number(a.key.slice(a.key.lastIndexOf('-') + 1)) - Number(b.key.slice(b.key.lastIndexOf('-') + 1))

/**
 * Epic progress and its items from the Jira mirror, with the workflow applied. Items are listed
 * blocked first, then in progress, review, to do and done. Null when the epic is not mirrored.
 */
export const epicView = (
  epicKey: string,
  dataset: FlowDataset,
  workflow: Workflow,
): EpicView | null => {
  const issues = dataset.issues.filter(
    (issue) => issue.key === epicKey || issue.epicKey === epicKey,
  )
  const timelines = buildTimelines({ issues, changes: dataset.changes }, workflow)
  const epic = timelines.find((timeline) => timeline.issue.key === epicKey)
  if (!epic) return null
  const work = timelines.filter((timeline) => timeline.issue.key !== epicKey)
  const [progress] = epicProgress([epic], work)
  if (!progress) return null
  const tasks = work
    .map(toItem)
    .toSorted(
      (a, b) =>
        TASK_ORDER.indexOf(a.category) - TASK_ORDER.indexOf(b.category) || byKeyNumber(a, b),
    )
  return {
    epic: {
      ...progress,
      open: tasks.filter((task) => task.category !== 'done').length,
      blocked: tasks.filter((task) => task.category === 'blocked').length,
    },
    tasks,
  }
}

/** Repository of a GitHub pull request URL, in lower case; null for any other URL. */
export const repoOfPullUrl = (url: string) => PULL_URL.exec(url)?.[1]?.toLowerCase() ?? null

const repoSet = (repos: readonly string[]) => new Set(repos.map((repo) => repo.toLowerCase()))

/**
 * Open pull requests of the review queue that belong to the project: the PR is in one of its
 * repositories or carries the key of one of its Jira items. Repeated URLs count once.
 */
export const openPullRequests = (
  panel: PanelData,
  repos: readonly string[],
  taskKeys: ReadonlySet<string>,
): ProjectPullRequest[] => {
  const wanted = repoSet(repos)
  const seen = new Set<string>()
  return panel.datasets
    .flatMap((dataset) => dataset.queue)
    .filter((row) => {
      const repo = repoOfPullUrl(row.url)
      const belongs =
        (repo !== null && wanted.has(repo)) || (row.taskKey !== null && taskKeys.has(row.taskKey))
      if (!belongs || seen.has(row.url)) return false
      seen.add(row.url)
      return true
    })
    .map((row): ProjectPullRequest => ({
      repo: repoOfPullUrl(row.url),
      number: row.number,
      title: row.title,
      url: row.url,
      author: row.author,
      taskKey: row.taskKey,
      state: 'open',
      at: new Date(row.enteredAt).toISOString(),
    }))
    .toSorted((a, b) => b.at.localeCompare(a.at))
}

/** Pull requests merged in the project repositories since `since`, newest first. */
export const mergedPullRequests = (
  changes: readonly Change[],
  repos: readonly string[],
  since: string,
): ProjectPullRequest[] => {
  const wanted = repoSet(repos)
  return changes
    .filter((change) => wanted.has(change.repo.toLowerCase()) && change.mergedAt >= since)
    .map((change): ProjectPullRequest => ({
      repo: change.repo,
      number: change.pullNumber,
      title: change.title,
      url: null,
      author: null,
      taskKey: TASK_KEY.exec(change.title)?.[1] ?? null,
      state: 'merged',
      at: new Date(change.mergedAt).toISOString(),
    }))
    .toSorted((a, b) => b.at.localeCompare(a.at))
}

export interface ProjectDelivery {
  deploys: DoraDeploy[]
  dora: DoraRepoSummary[]
}

/** Production deploys and DORA summary of the project repositories, out of the full computation. */
export const projectDelivery = (
  metrics: DoraMetricsResponse,
  repos: readonly string[],
): ProjectDelivery => {
  const wanted = repoSet(repos)
  return {
    deploys: metrics.deploys
      .filter((deploy) => wanted.has(deploy.repo.toLowerCase()))
      .toSorted((a, b) => b.deployedAt.localeCompare(a.deployedAt)),
    dora: metrics.repos.filter((repo) => wanted.has(repo.repo.toLowerCase())),
  }
}

/** Handbook card with exactly this name or slug; the project catalog never guesses by prefix. */
export const resolveSystem = (handbook: Handbook, reference: string): ProjectSystem => {
  const slug = slugify(reference)
  const target = normalize(reference)
  const card = handbook.systems.find(
    (system) => system.slug === slug || normalize(system.name) === target,
  )
  if (!card) return { name: reference, slug: null, status: null, owner: null, summary: null }
  return {
    name: card.name,
    slug: card.slug,
    status: card.fields['Status'] ?? null,
    owner: card.fields['Dono'] ?? null,
    summary: card.fields['O que é'] ?? null,
  }
}

/** Pending decision first, then standard with the same ID; unknown IDs stay visible. */
export const resolveDecision = (handbook: Handbook, id: string): ProjectDecision => {
  const target = id.trim().toUpperCase()
  const decision = handbook.decisions.find((item) => item.id.toUpperCase() === target)
  if (decision) {
    return {
      id: decision.id,
      kind: 'decision',
      title: decision.topic,
      detail: decision.question,
      priority: decision.priority,
    }
  }
  const standard = findStandard(handbook, target)
  if (standard) {
    return {
      id: standard.id,
      kind: 'standard',
      title: standard.title,
      detail: standard.fields['Regra'] ?? null,
      priority: null,
    }
  }
  return { id: target, kind: 'unknown', title: null, detail: null, priority: null }
}

/** Case and accent insensitive match over the fields people search a project by. */
export const matchesTerm = (entry: ProjectEntry, term: string | undefined) => {
  if (!term) return true
  const haystack = normalize(
    [entry.id, entry.name, entry.objective, entry.owner, entry.epic ?? '', ...entry.repos].join(
      ' ',
    ),
  )
  return haystack.includes(normalize(term))
}

/** Project by id, then by name or id containing the reference. */
export const findProject = <T extends { entry: ProjectEntry }>(
  projects: readonly T[],
  reference: string,
): T | null => {
  const target = normalize(reference)
  return (
    projects.find((project) => project.entry.id === reference.trim()) ??
    projects.find((project) => normalize(project.entry.name) === target) ??
    projects.find(
      (project) =>
        normalize(project.entry.name).includes(target) || project.entry.id.includes(target),
    ) ??
    null
  )
}
