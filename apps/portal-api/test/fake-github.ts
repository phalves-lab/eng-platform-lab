import { createHash } from 'node:crypto'
import {
  type GitHubBranchHead,
  type GitHubCheckRun,
  type GitHubClient,
  type GitHubCompare,
  GitHubError,
  type GitHubPull,
  type GitHubPullDetail,
  type GitHubReview,
  type GitHubTag,
  type GitHubWorkflowRun,
} from '../src/releases/github.js'

interface RepoState {
  branches: string[]
  pulls: GitHubPull[]
  compare: Record<string, GitHubCompare>
  checks: Record<string, GitHubCheckRun[]>
  tags: GitHubTag[]
  mergeable: Record<number, boolean | null>
  heads: Record<string, GitHubBranchHead>
  reviews: Record<number, GitHubReview[]>
  workflows: Record<string, GitHubWorkflowRun[]>
  closed: number[]
}

export const fakeSha = (seed: string) =>
  createHash('sha256').update(seed).digest('hex').slice(0, 40)
const SHA = /^[0-9a-f]{40}$/

export const pull = (overrides: Partial<GitHubPull> & { number: number }): GitHubPull => ({
  title: `feat: PR ${overrides.number}`,
  url: `https://github.example/pr/${overrides.number}`,
  author: 'ana',
  body: '',
  headRef: `feat/LAB-${overrides.number}-x`,
  baseRef: 'develop',
  labels: [],
  mergedAt: '2026-11-10T10:00:00Z',
  ...overrides,
})

/** In-memory GitHub that answers like the REST client and counts every call. */
export class FakeGitHub implements GitHubClient {
  readonly calls: string[] = []
  private readonly repos = new Map<string, RepoState>()

  repo(name: string, state: Partial<RepoState>): this {
    this.repos.set(name, {
      branches: [],
      pulls: [],
      compare: {},
      checks: {},
      tags: [],
      mergeable: {},
      heads: {},
      reviews: {},
      workflows: {},
      closed: [],
      ...state,
    })
    return this
  }

  state(repo: string): RepoState {
    const found = this.repos.get(repo)
    if (!found) throw new GitHubError(404, `repo ${repo} not found`)
    return found
  }

  async compare(repo: string, base: string, head: string) {
    this.calls.push(`compare ${repo} ${base}...${head}`)
    const state = this.state(repo)
    if (!state.branches.includes(base) || !state.branches.includes(head)) {
      throw new GitHubError(404, 'branch not found')
    }
    return state.compare[`${base}...${head}`] ?? { aheadBy: 0, behindBy: 0 }
  }

  async mergedPulls(repo: string, base: string, since: string | null) {
    this.calls.push(`mergedPulls ${repo} ${base} ${since ?? '-'}`)
    return this.state(repo).pulls.filter(
      (item) => item.baseRef === base && item.mergedAt && (!since || item.mergedAt > since),
    )
  }

  async openPulls(repo: string, base: string) {
    this.calls.push(`openPulls ${repo} ${base}`)
    return this.state(repo).pulls.filter((item) => item.baseRef === base && !item.mergedAt)
  }

  async mergeable(repo: string, pullNumber: number) {
    this.calls.push(`mergeable ${repo} ${pullNumber}`)
    return this.state(repo).mergeable[pullNumber] ?? null
  }

  async branches(repo: string) {
    this.calls.push(`branches ${repo}`)
    return this.state(repo).branches
  }

  async checkRuns(repo: string, ref: string) {
    this.calls.push(`checkRuns ${repo} ${ref}`)
    const state = this.state(repo)
    if (!SHA.test(ref) && !state.branches.includes(ref)) {
      throw new GitHubError(422, 'no commit found')
    }
    return state.checks[ref] ?? []
  }

  async branchHead(repo: string, branch: string) {
    this.calls.push(`branchHead ${repo} ${branch}`)
    const state = this.state(repo)
    if (!state.branches.includes(branch)) return null
    return state.heads[branch] ?? { sha: fakeSha(`${repo}:${branch}`), date: null }
  }

  async pull(repo: string, pullNumber: number): Promise<GitHubPullDetail> {
    this.calls.push(`pull ${repo} ${pullNumber}`)
    const state = this.state(repo)
    const found = state.pulls.find((item) => item.number === pullNumber)
    if (!found) throw new GitHubError(404, 'pull not found')
    const head = state.heads[found.headRef]?.sha ?? fakeSha(`${repo}:${found.headRef}`)
    return {
      number: found.number,
      title: found.title,
      url: found.url,
      body: found.body,
      headRef: found.headRef,
      headSha: head,
      baseRef: found.baseRef,
      state: found.mergedAt || state.closed.includes(pullNumber) ? 'closed' : 'open',
      merged: Boolean(found.mergedAt),
      mergedAt: found.mergedAt,
      mergeSha: found.mergedAt ? fakeSha(`${repo}:merge:${pullNumber}`) : null,
      mergeable: state.mergeable[pullNumber] ?? null,
    }
  }

  async reviews(repo: string, pullNumber: number) {
    this.calls.push(`reviews ${repo} ${pullNumber}`)
    return this.state(repo).reviews[pullNumber] ?? []
  }

  async workflowRuns(repo: string, workflow: string, branch: string) {
    this.calls.push(`workflowRuns ${repo} ${workflow} ${branch}`)
    return this.state(repo).workflows[branch] ?? []
  }

  async tagExists(repo: string, tag: string) {
    this.calls.push(`tagExists ${repo} ${tag}`)
    return this.state(repo).tags.some((item) => item.name === tag)
  }

  async tags(repo: string) {
    this.calls.push(`tags ${repo}`)
    return this.state(repo).tags
  }
}
