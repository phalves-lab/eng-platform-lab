import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StatusChange, TaskStatus } from './types.js'

interface FixtureTask {
  key: string
  title: string
  status?: string
  acceptanceCriteria?: string[]
  statusHistory?: StatusChange[]
}

export const loadFixtureTasks = async (directory: string): Promise<TaskStatus[]> => {
  const files = (await readdir(directory)).filter((f) => f.endsWith('.json')).sort()
  return Promise.all(
    files.map(async (file) => {
      const task = JSON.parse(await readFile(join(directory, file), 'utf8')) as FixtureTask
      return {
        key: task.key,
        title: task.title,
        status: task.status ?? 'desconhecido',
        acceptanceCriteria: task.acceptanceCriteria?.length ?? 0,
        statusHistory: task.statusHistory ?? [],
      }
    }),
  )
}

interface JiraIssue {
  key: string
  fields: { summary: string; status?: { name?: string } }
  changelog?: {
    histories: {
      created: string
      items: { field: string; toString: string | null }[]
    }[]
  }
}

export interface JiraOptions {
  site: string
  email: string
  apiToken: string
  fetchImpl?: typeof fetch
}

/**
 * Lê status e histórico de transições das tasks no Jira, só com GET. O histórico é o que dá a
 * ordem em que cada task entrou em code review no board.
 */
export const fetchJiraTasks = async (
  keys: string[],
  options: JiraOptions,
): Promise<TaskStatus[]> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const authorization = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString('base64')}`
  const tasks: TaskStatus[] = []
  for (const key of keys) {
    const response = await fetchImpl(
      `https://${options.site}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status&expand=changelog`,
      { method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' } },
    )
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`Jira respondeu ${response.status} para ${key}.`)
    const issue = (await response.json()) as JiraIssue
    const statusHistory = (issue.changelog?.histories ?? [])
      .flatMap((history) =>
        history.items
          .filter((item) => item.field === 'status' && item.toString)
          .map((item) => ({ status: item.toString ?? '', at: history.created })),
      )
      .sort((a, b) => a.at.localeCompare(b.at))
    tasks.push({
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status?.name ?? 'desconhecido',
      acceptanceCriteria: -1,
      statusHistory,
    })
  }
  return tasks
}
