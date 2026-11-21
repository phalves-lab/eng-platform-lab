import { demoDataset } from './demo.js'
import { fetchPullRequests } from './github.js'
import type { PanelData } from './contract.js'
import { buildPanelData, type DatasetSource } from './panel-data.js'
import { fetchJiraTasks, loadFixtureTasks } from './tasks.js'
import { daysAgo } from './time.js'
import type { TaskStatus } from './types.js'

export interface LabSource {
  token: string
  repository: string
  taskSource: 'fixtures' | 'jira'
  fixturesDir: string
  jira?: { site: string; email: string; apiToken: string }
  ci?: boolean
}

export interface CollectOptions {
  lab: LabSource | null
  demo: boolean
  fetchImpl?: typeof fetch
}

const loadTasks = async (
  lab: LabSource,
  keys: string[],
  fetchImpl: typeof fetch | undefined,
): Promise<TaskStatus[]> => {
  if (lab.taskSource === 'fixtures') return loadFixtureTasks(lab.fixturesDir)
  if (lab.ci) throw new Error('Leitura do Jira real só roda localmente.')
  return fetchJiraTasks(keys, {
    site: lab.jira?.site ?? '',
    email: lab.jira?.email ?? '',
    apiToken: lab.jira?.apiToken ?? '',
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}

const collectLab = async (
  lab: LabSource,
  now: string,
  fetchImpl: typeof fetch | undefined,
): Promise<DatasetSource> => {
  if (!lab.token || !lab.repository) throw new Error('Defina GITHUB_TOKEN e GITHUB_REPOSITORY.')
  const pullRequests = await fetchPullRequests({
    token: lab.token,
    repository: lab.repository,
    since: daysAgo(now, 90),
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  const keys = [
    ...new Set(pullRequests.map((pr) => pr.taskKey).filter((k): k is string => Boolean(k))),
  ]
  const tasks = await loadTasks(lab, keys, fetchImpl)
  return {
    id: 'lab',
    title: 'Laboratório',
    dataset: { label: `Laboratório (${lab.repository})`, generatedAt: now, pullRequests, tasks },
  }
}

/** Collects every requested dataset and computes queue, alerts and metrics for the panel. */
export const collectPanelData = async (
  options: CollectOptions,
  now: string,
): Promise<PanelData> => {
  const sources: DatasetSource[] = options.lab
    ? [await collectLab(options.lab, now, options.fetchImpl)]
    : []
  if (options.demo)
    sources.push({ id: 'demo', title: 'Exemplo com time de 8', dataset: demoDataset(now) })
  return buildPanelData(sources, now)
}
