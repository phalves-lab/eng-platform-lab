import type { ChangeInput, DeployInput } from '@lab/database'
import type { DoraRepo } from '@lab/dora'
import { type ZodType, z } from 'zod'
import type { DeliverySource } from './source.js'

export class GitHubReadError extends Error {
  override readonly name = 'GitHubReadError'

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface GitHubSourceOptions {
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
  maxPages?: number
}

const PER_PAGE = 100
const DEFAULT_MAX_PAGES = 5
const ROLLED_BACK_MARKER = 'rolled_back'

const httpUrl = z
  .string()
  .nullish()
  .transform((value) => (value && /^https?:\/\//.test(value) ? value : null))

const DeploymentSchema = z.object({
  id: z.number().int(),
  sha: z.string(),
  created_at: z.string(),
  payload: z.unknown().optional(),
})

const DeploymentStatusSchema = z.object({
  state: z.string(),
  description: z.string().nullish(),
  created_at: z.string(),
  log_url: httpUrl,
  target_url: httpUrl,
})

const WorkflowRunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      head_sha: z.string(),
      conclusion: z.string().nullable(),
      updated_at: z.string(),
      html_url: httpUrl,
    }),
  ),
})

const PullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  updated_at: z.string(),
})

const PullCommitSchema = z.object({
  commit: z.object({
    author: z.object({ date: z.string() }).nullable(),
    committer: z.object({ date: z.string() }).nullable(),
  }),
})

const CompareSchema = z.object({ commits: z.array(z.object({ sha: z.string() })) })

const DeployPayloadSchema = z.object({ deployedAt: z.iso.datetime({ offset: true }) })

const FINAL_STATES = new Set(['success', 'failure', 'error'])

type DeployStatus = DeployInput['status']

const statusOf = (state: string, description: string | null | undefined): DeployStatus => {
  if (description?.includes(ROLLED_BACK_MARKER)) return 'rolled_back'
  return state === 'success' ? 'success' : 'failure'
}

const isOnOrAfter = (iso: string, since: number) => Date.parse(iso) >= since

/**
 * Read-only GitHub adapter of the DORA collector. Only GET requests leave this module: it lists
 * deployments (or deploy workflow runs), compares consecutive deploys to know which commits each
 * one shipped, and lists merged pull requests with the date of their first commit.
 */
export const createGitHubSource = (options: GitHubSourceOptions): DeliverySource => {
  const apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES

  const get = async <T>(path: string, schema: ZodType<T>): Promise<T> => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) {
      const limited =
        response.status === 429 ||
        (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
      throw new GitHubReadError(
        limited ? 429 : response.status,
        `GitHub respondeu ${response.status} em ${path.split('?')[0]}`,
      )
    }
    return schema.parse(await response.json())
  }

  const paginate = async <T>(
    path: string,
    schema: ZodType<T[]>,
    reachedOld: (batch: T[]) => boolean,
  ): Promise<T[]> => {
    const items: T[] = []
    const separator = path.includes('?') ? '&' : '?'
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await get(`${path}${separator}per_page=${PER_PAGE}&page=${page}`, schema)
      items.push(...batch)
      if (batch.length < PER_PAGE || reachedOld(batch)) break
    }
    return items
  }

  const deployments = async (repo: DoraRepo, since: number): Promise<DeployInput[]> => {
    const environment = encodeURIComponent(repo.productionEnvironment)
    const listed = await paginate(
      `/repos/${repo.repo}/deployments?environment=${environment}`,
      z.array(DeploymentSchema),
      (batch) => batch.some((item) => !isOnOrAfter(item.created_at, since)),
    )
    const recent = listed.filter((item) => isOnOrAfter(item.created_at, since))
    const deploys = await Promise.all(
      recent.map(async (deployment): Promise<DeployInput | null> => {
        const statuses = await get(
          `/repos/${repo.repo}/deployments/${deployment.id}/statuses?per_page=20`,
          z.array(DeploymentStatusSchema),
        )
        const final = statuses.find((status) => FINAL_STATES.has(status.state))
        if (!final) return null
        const payload = DeployPayloadSchema.safeParse(deployment.payload)
        return {
          repo: repo.repo,
          environment: repo.productionEnvironment,
          sha: deployment.sha,
          deployedAt: payload.success ? payload.data.deployedAt : final.created_at,
          status: statusOf(final.state, final.description),
          url: final.log_url ?? final.target_url,
        }
      }),
    )
    return deploys.filter((deploy): deploy is DeployInput => deploy !== null)
  }

  const workflowRuns = async (
    repo: DoraRepo,
    workflow: string,
    since: number,
  ): Promise<DeployInput[]> => {
    const created = encodeURIComponent(`>=${new Date(since).toISOString().slice(0, 10)}`)
    const branch = encodeURIComponent(repo.defaultBranch)
    const runs = await paginate(
      `/repos/${repo.repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${branch}&status=completed&created=${created}`,
      WorkflowRunsSchema.transform((body) => body.workflow_runs),
      () => false,
    )
    return runs.flatMap((run) => {
      if (run.conclusion !== 'success' && run.conclusion !== 'failure') return []
      if (!isOnOrAfter(run.updated_at, since)) return []
      return [
        {
          repo: repo.repo,
          environment: repo.productionEnvironment,
          sha: run.head_sha,
          deployedAt: run.updated_at,
          status: run.conclusion,
          url: run.html_url,
        },
      ]
    })
  }

  const shippedSince = async (repo: DoraRepo, previous: string | null, sha: string) => {
    if (previous === null) return [sha]
    if (previous === sha) return []
    const compare = await get(
      `/repos/${repo.repo}/compare/${previous}...${sha}?per_page=${PER_PAGE}`,
      CompareSchema,
    )
    return compare.commits.map((commit) => commit.sha)
  }

  /** Each deploy that reached production ships the commits after the previous one that did. */
  const withShippedCommits = async (
    repo: DoraRepo,
    deploys: DeployInput[],
  ): Promise<DeployInput[]> => {
    const ordered = deploys.toSorted((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt))
    const result: DeployInput[] = []
    let previous: string | null = null
    for (const deploy of ordered) {
      if (deploy.status === 'failure') {
        result.push({ ...deploy, commitShas: [] })
        continue
      }
      result.push({ ...deploy, commitShas: await shippedSince(repo, previous, deploy.sha) })
      previous = deploy.sha
    }
    return result
  }

  const changes = async (repo: DoraRepo, since: number): Promise<ChangeInput[]> => {
    const branch = encodeURIComponent(repo.defaultBranch)
    const pulls = await paginate(
      `/repos/${repo.repo}/pulls?state=closed&base=${branch}&sort=updated&direction=desc`,
      z.array(PullSchema),
      (batch) => batch.some((pull) => !isOnOrAfter(pull.updated_at, since)),
    )
    const merged = pulls.filter(
      (pull): pull is typeof pull & { merged_at: string; merge_commit_sha: string } =>
        pull.merged_at !== null &&
        pull.merge_commit_sha !== null &&
        isOnOrAfter(pull.merged_at, since),
    )
    return Promise.all(
      merged.map(async (pull) => {
        const [first] = await get(
          `/repos/${repo.repo}/pulls/${pull.number}/commits?per_page=1`,
          z.array(PullCommitSchema),
        )
        const firstCommitAt =
          first?.commit.author?.date ?? first?.commit.committer?.date ?? pull.merged_at
        return {
          repo: repo.repo,
          pullNumber: pull.number,
          title: pull.title,
          mergeSha: pull.merge_commit_sha,
          firstCommitAt,
          mergedAt: pull.merged_at,
        }
      }),
    )
  }

  return {
    async collect(repo, sinceIso) {
      const since = Date.parse(sinceIso)
      const source = repo.source
      if (source.type === 'fixture') {
        throw new GitHubReadError(400, `${repo.repo} usa fixture, não GitHub`)
      }
      const deploys =
        source.type === 'github-workflow'
          ? await workflowRuns(repo, source.workflow, since)
          : await deployments(repo, since)
      return {
        deploys: await withShippedCommits(repo, deploys),
        changes: await changes(repo, since),
      }
    },
  }
}
