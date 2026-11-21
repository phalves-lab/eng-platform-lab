import type { RepoCatalogEntry } from '@lab/contracts'
import {
  type AlertCounts,
  type BranchFacts,
  emptyAlerts,
  type RepoFacts,
  type RepoSource,
} from './facts.js'

export interface GitHubSourceOptions {
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}

export class GitHubReadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface Page<T> {
  ok: true
  data: T
  next: string | null
}

type Read<T> = Page<T> | { ok: false; status: number }

interface RawRepo {
  default_branch: string
  security_and_analysis?: {
    secret_scanning?: { status?: string }
    secret_scanning_push_protection?: { status?: string }
  } | null
}

interface RawRule {
  type: string
}

interface RawClassicProtection {
  required_pull_request_reviews?: unknown
  allow_force_pushes?: { enabled?: boolean }
  allow_deletions?: { enabled?: boolean }
}

interface RawContent {
  name: string
  path: string
  type: string
  content?: string
  encoding?: string
}

interface RawDependabotAlert {
  security_advisory?: { severity?: string } | null
  security_vulnerability?: { severity?: string } | null
}

interface RawCodeScanningAlert {
  rule?: { security_severity_level?: string | null; severity?: string | null } | null
}

const MAX_PAGES = 10
const WORKFLOW_FILE = /\.ya?ml$/
const CODE_SEVERITY: Record<string, keyof AlertCounts> = {
  critical: 'critical',
  high: 'high',
  error: 'high',
  medium: 'medium',
  warning: 'medium',
  moderate: 'medium',
  low: 'low',
  note: 'low',
}

const nextLink = (header: string | null) => {
  const part = header?.split(',').find((item) => item.includes('rel="next"'))
  if (!part) return null
  return part.slice(part.indexOf('<') + 1, part.indexOf('>'))
}

/** Rulesets and classic protection can coexist; `unknown` only when that could hide a gap. */
const protectionOf = (
  rulesets: boolean,
  classic: boolean,
  unreadable: boolean,
): BranchFacts['protection'] => {
  if (unreadable) return 'unknown'
  if (rulesets && classic) return 'both'
  if (rulesets) return 'ruleset'
  return classic ? 'classic' : 'none'
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

const decode = (content: RawContent) =>
  content.encoding === 'base64'
    ? Buffer.from(content.content ?? '', 'base64').toString('utf8')
    : (content.content ?? '')

const enabled = (status: string | undefined) => (status === undefined ? null : status === 'enabled')

const countBy = <T>(items: T[], severityOf: (item: T) => string | null | undefined) => {
  const counts = emptyAlerts()
  for (const item of items) {
    const severity = CODE_SEVERITY[(severityOf(item) ?? '').toLowerCase()] ?? 'low'
    counts[severity] += 1
  }
  return counts
}

/**
 * GitHub REST adapter of the scorecard. Every request is a GET; 403 and 404 on optional reads
 * become "not readable" or "absent" facts, while rate limits and server errors fail the repo.
 */
export const createGitHubRepoSource = (options: GitHubSourceOptions): RepoSource => {
  const apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch

  const send = (target: string) => {
    const url = target.startsWith('http') ? target : `${apiUrl}${target}`
    return fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  }

  const isLimited = (response: Response) =>
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')

  const failure = (response: Response, target: string) => {
    const limited = isLimited(response)
    const path = new URL(target, apiUrl).pathname
    return new GitHubReadError(
      limited ? 429 : response.status,
      `GitHub respondeu ${limited ? 'limite de requisições' : response.status} em ${path}`,
    )
  }

  const page = async <T>(response: Response): Promise<Page<T>> => {
    const next = nextLink(response.headers.get('link'))
    return {
      ok: true,
      data: (await response.json()) as T,
      next: next?.startsWith(apiUrl) ? next : null,
    }
  }

  const required = async <T>(target: string): Promise<Page<T>> => {
    const response = await send(target)
    if (!response.ok) throw failure(response, target)
    return page<T>(response)
  }

  const read = async <T>(target: string, tolerated: number[]): Promise<Read<T>> => {
    const response = await send(target)
    if (response.ok) return page<T>(response)
    if (!isLimited(response) && tolerated.includes(response.status)) {
      return { ok: false, status: response.status }
    }
    throw failure(response, target)
  }

  const readAll = async <T>(path: string, tolerated: number[]): Promise<T[] | null> => {
    const items: T[] = []
    let target: string | null = path
    for (let page = 0; target && page < MAX_PAGES; page += 1) {
      const result: Read<T[]> = await read<T[]>(target, tolerated)
      if (!result.ok) return null
      items.push(...result.data)
      target = result.next
    }
    return items
  }

  const branchFacts = async (repo: string, name: string): Promise<BranchFacts> => {
    const branch = encodeURIComponent(name)
    const absent: BranchFacts = {
      name,
      exists: false,
      protection: 'none',
      requiresPullRequest: false,
      blocksForcePush: false,
      blocksDeletion: false,
      mergeQueue: false,
    }
    const found = await read<unknown>(`/repos/${repo}/branches/${branch}`, [404])
    if (!found.ok) return absent
    const rules =
      (await readAll<RawRule>(`/repos/${repo}/rules/branches/${branch}?per_page=100`, [404])) ?? []
    const types = new Set(rules.map((rule) => rule.type))
    const classic = await read<RawClassicProtection>(
      `/repos/${repo}/branches/${branch}/protection`,
      [403, 404],
    )
    const classicRules = classic.ok
      ? {
          pullRequest: classic.data.required_pull_request_reviews !== undefined,
          forcePush: classic.data.allow_force_pushes?.enabled !== true,
          deletion: classic.data.allow_deletions?.enabled !== true,
        }
      : { pullRequest: false, forcePush: false, deletion: false }
    const facts = {
      requiresPullRequest: types.has('pull_request') || classicRules.pullRequest,
      blocksForcePush: types.has('non_fast_forward') || classicRules.forcePush,
      blocksDeletion: types.has('deletion') || classicRules.deletion,
    }
    const complete = facts.requiresPullRequest && facts.blocksForcePush && facts.blocksDeletion
    const unreadable = !classic.ok && classic.status === 403 && !complete
    const protection = protectionOf(types.size > 0, classic.ok, unreadable)
    return { ...absent, exists: true, protection, ...facts, mergeQueue: types.has('merge_queue') }
  }

  const workflows = async (repo: string) => {
    const listing = await read<RawContent[]>(`/repos/${repo}/contents/.github/workflows`, [404])
    if (!listing.ok || !Array.isArray(listing.data)) return []
    const files = listing.data.filter(
      (item) => item.type === 'file' && WORKFLOW_FILE.test(item.name),
    )
    return Promise.all(
      files.map(async (file) => {
        const content = await required<RawContent>(
          `/repos/${repo}/contents/${encodePath(file.path)}`,
        )
        return { path: file.path, content: decode(content.data) }
      }),
    )
  }

  const agentsMd = async (repo: string): Promise<RepoFacts['agentsMd']> => {
    const file = await read<RawContent>(`/repos/${repo}/contents/AGENTS.md`, [404])
    if (!file.ok) return { present: false, updatedAt: null }
    const commits = await required<{ commit: { committer: { date?: string } | null } }[]>(
      `/repos/${repo}/commits?path=AGENTS.md&per_page=1`,
    )
    const date = commits.data[0]?.commit.committer?.date
    return { present: true, updatedAt: date ? new Date(date).toISOString() : null }
  }

  const nvmrc = async (repo: string) => {
    const file = await read<RawContent>(`/repos/${repo}/contents/.nvmrc`, [404])
    return file.ok ? decode(file.data).trim() : null
  }

  const codeScanning = async (repo: string): Promise<RepoFacts['codeScanning']> => {
    const path = `/repos/${repo}/code-scanning/alerts?state=open&per_page=100`
    const first = await read<RawCodeScanningAlert[]>(path, [403, 404])
    if (!first.ok) return first.status === 404 ? { enabled: false } : null
    const rest = first.next ? ((await readAll<RawCodeScanningAlert>(first.next, [])) ?? []) : []
    const alerts = [...first.data, ...rest]
    return {
      enabled: true,
      alerts: countBy(
        alerts,
        (alert) => alert.rule?.security_severity_level ?? alert.rule?.severity,
      ),
    }
  }

  return {
    async facts(entry: RepoCatalogEntry): Promise<RepoFacts> {
      const repo = entry.repo
      const info = await required<RawRepo>(`/repos/${repo}`)
      const defaultBranch = info.data.default_branch
      const names = [...new Set([defaultBranch, entry.integrationBranch])]
      const security = info.data.security_and_analysis
      const dependabot = await readAll<RawDependabotAlert>(
        `/repos/${repo}/dependabot/alerts?state=open&per_page=100`,
        [403, 404],
      )
      const labels = await readAll<{ name: string }>(`/repos/${repo}/labels?per_page=100`, [])
      return {
        defaultBranch,
        branches: await Promise.all(names.map((name) => branchFacts(repo, name))),
        workflows: await workflows(repo),
        agentsMd: await agentsMd(repo),
        nvmrc: await nvmrc(repo),
        secretScanning: {
          secretScanning: enabled(security?.secret_scanning?.status),
          pushProtection: enabled(security?.secret_scanning_push_protection?.status),
        },
        dependabotAlerts: dependabot
          ? countBy(
              dependabot,
              (alert) =>
                alert.security_advisory?.severity ?? alert.security_vulnerability?.severity,
            )
          : null,
        codeScanning: await codeScanning(repo),
        labels: (labels ?? []).map((label) => label.name),
      }
    },
  }
}
