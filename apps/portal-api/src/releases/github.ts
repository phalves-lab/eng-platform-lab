export const GITHUB_CLIENT = Symbol('GITHUB_CLIENT')

export interface GitHubPull {
  number: number
  title: string
  url: string
  author: string
  body: string
  headRef: string
  baseRef: string
  labels: string[]
  mergedAt: string | null
}

export interface GitHubCompare {
  aheadBy: number
  behindBy: number
}

export interface GitHubCheckRun {
  name: string
  status: string
  conclusion: string | null
}

export interface GitHubTag {
  name: string
  date: string | null
  url: string
}

export interface GitHubBranchHead {
  sha: string
  date: string | null
}

export interface GitHubPullDetail {
  number: number
  title: string
  url: string
  body: string
  headRef: string
  headSha: string
  baseRef: string
  state: 'open' | 'closed'
  merged: boolean
  mergedAt: string | null
  mergeSha: string | null
  mergeable: boolean | null
}

export interface GitHubReview {
  author: string
  state: string
  submittedAt: string | null
}

export interface GitHubWorkflowRun {
  status: string
  conclusion: string | null
  url: string
}

/** Read-only view of the GitHub API used by the release preview. It has no write method. */
export interface GitHubClient {
  compare(repo: string, base: string, head: string): Promise<GitHubCompare>
  mergedPulls(repo: string, base: string, since: string | null): Promise<GitHubPull[]>
  openPulls(repo: string, base: string): Promise<GitHubPull[]>
  mergeable(repo: string, pullNumber: number): Promise<boolean | null>
  branches(repo: string): Promise<string[]>
  checkRuns(repo: string, ref: string): Promise<GitHubCheckRun[]>
  tags(repo: string): Promise<GitHubTag[]>
  branchHead(repo: string, branch: string): Promise<GitHubBranchHead | null>
  pull(repo: string, pullNumber: number): Promise<GitHubPullDetail>
  reviews(repo: string, pullNumber: number): Promise<GitHubReview[]>
  workflowRuns(repo: string, workflow: string, branch: string): Promise<GitHubWorkflowRun[]>
  tagExists(repo: string, tag: string): Promise<boolean>
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface RawPull {
  number: number
  title: string
  html_url: string
  body: string | null
  user: { login: string } | null
  head: { ref: string }
  base: { ref: string }
  labels: { name: string }[]
  merged_at: string | null
  updated_at: string
}

interface RawPullDetail {
  number: number
  title: string
  html_url: string
  body: string | null
  state: 'open' | 'closed'
  merged: boolean
  merged_at: string | null
  merge_commit_sha: string | null
  mergeable: boolean | null
  head: { ref: string; sha: string }
  base: { ref: string }
}

interface RestOptions {
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}

const PAGE_SIZE = 100
const MAX_PAGES_SINCE = 10
const MAX_PAGES_RECENT = 2
const MAX_BRANCH_PAGES = 5
const TAGS_WITH_DATE = 10

const toPull = (raw: RawPull): GitHubPull => ({
  number: raw.number,
  title: raw.title,
  url: raw.html_url,
  author: raw.user?.login ?? 'desconhecido',
  body: raw.body ?? '',
  headRef: raw.head.ref,
  baseRef: raw.base.ref,
  labels: raw.labels.map((label) => label.name),
  mergedAt: raw.merged_at,
})

/** REST implementation over `fetch`. Only GET requests leave this module. */
export const createRestGitHub = (options: RestOptions): GitHubClient => {
  const apiUrl = options.apiUrl ?? 'https://api.github.com'
  const fetchImpl = options.fetchImpl ?? fetch

  const get = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (response.ok) return (await response.json()) as T
    const limited =
      response.status === 429 ||
      (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
    throw new GitHubError(
      limited ? 429 : response.status,
      `GitHub respondeu ${response.status} em ${path.split('?')[0]}`,
    )
  }

  const orNull = async <T>(read: Promise<T>): Promise<T | null> => {
    try {
      return await read
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null
      throw error
    }
  }

  const repoPath = (repo: string) => `/repos/${repo}`
  const ref = (name: string) => encodeURIComponent(name)

  const listPulls = async (
    repo: string,
    state: 'open' | 'closed',
    base: string,
    maxPages: number,
    stopBefore: string | null,
  ): Promise<GitHubPull[]> => {
    const result: GitHubPull[] = []
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await get<RawPull[]>(
        `${repoPath(repo)}/pulls?state=${state}&base=${ref(base)}&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      )
      result.push(...batch.map(toPull))
      const oldest = batch.at(-1)?.updated_at
      if (batch.length < PAGE_SIZE || (stopBefore && oldest && oldest < stopBefore)) break
    }
    return result
  }

  return {
    async compare(repo, base, head) {
      const data = await get<{ ahead_by: number; behind_by: number }>(
        `${repoPath(repo)}/compare/${ref(base)}...${ref(head)}?per_page=1`,
      )
      return { aheadBy: data.ahead_by, behindBy: data.behind_by }
    },

    async mergedPulls(repo, base, since) {
      const pulls = await listPulls(
        repo,
        'closed',
        base,
        since ? MAX_PAGES_SINCE : MAX_PAGES_RECENT,
        since,
      )
      return pulls.filter((pull) => pull.mergedAt && (!since || pull.mergedAt > since))
    },

    openPulls(repo, base) {
      return listPulls(repo, 'open', base, 1, null)
    },

    async mergeable(repo, pullNumber) {
      const data = await get<{ mergeable: boolean | null }>(`${repoPath(repo)}/pulls/${pullNumber}`)
      return data.mergeable
    },

    async branches(repo) {
      const names: string[] = []
      for (let page = 1; page <= MAX_BRANCH_PAGES; page += 1) {
        const batch = await get<{ name: string }[]>(
          `${repoPath(repo)}/branches?per_page=${PAGE_SIZE}&page=${page}`,
        )
        names.push(...batch.map((branch) => branch.name))
        if (batch.length < PAGE_SIZE) break
      }
      return names
    },

    async checkRuns(repo, headRef) {
      const data = await get<{ check_runs: GitHubCheckRun[] }>(
        `${repoPath(repo)}/commits/${ref(headRef)}/check-runs?per_page=100`,
      )
      return data.check_runs.map(({ name, status, conclusion }) => ({ name, status, conclusion }))
    },

    async tags(repo) {
      const tags = await get<{ name: string; commit: { sha: string } }[]>(
        `${repoPath(repo)}/tags?per_page=${TAGS_WITH_DATE}`,
      )
      return Promise.all(
        tags.map(async (tag) => {
          const commit = await get<{ commit: { committer: { date: string } | null } }>(
            `${repoPath(repo)}/commits/${tag.commit.sha}`,
          )
          return {
            name: tag.name,
            date: commit.commit.committer?.date ?? null,
            url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag.name)}`,
          }
        }),
      )
    },

    async branchHead(repo, branch) {
      const data = await orNull(
        get<{ commit: { sha: string; commit: { committer: { date: string } | null } } }>(
          `${repoPath(repo)}/branches/${ref(branch)}`,
        ),
      )
      if (!data) return null
      return { sha: data.commit.sha, date: data.commit.commit.committer?.date ?? null }
    },

    async pull(repo, pullNumber) {
      const raw = await get<RawPullDetail>(`${repoPath(repo)}/pulls/${pullNumber}`)
      return {
        number: raw.number,
        title: raw.title,
        url: raw.html_url,
        body: raw.body ?? '',
        headRef: raw.head.ref,
        headSha: raw.head.sha,
        baseRef: raw.base.ref,
        state: raw.state,
        merged: raw.merged,
        mergedAt: raw.merged_at,
        mergeSha: raw.merge_commit_sha,
        mergeable: raw.mergeable,
      }
    },

    async reviews(repo, pullNumber) {
      const data = await get<
        { user: { login: string } | null; state: string; submitted_at: string | null }[]
      >(`${repoPath(repo)}/pulls/${pullNumber}/reviews?per_page=${PAGE_SIZE}`)
      return data.map((review) => ({
        author: review.user?.login ?? 'desconhecido',
        state: review.state,
        submittedAt: review.submitted_at,
      }))
    },

    async workflowRuns(repo, workflow, branch) {
      const data = await orNull(
        get<{ workflow_runs: { status: string; conclusion: string | null; html_url: string }[] }>(
          `${repoPath(repo)}/actions/workflows/${ref(workflow)}/runs?branch=${ref(branch)}&per_page=1`,
        ),
      )
      return (data?.workflow_runs ?? []).map((run) => ({
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
      }))
    },

    async tagExists(repo, tag) {
      return Boolean(await orNull(get<unknown>(`${repoPath(repo)}/git/ref/tags/${ref(tag)}`)))
    },
  }
}
