import {
  type GitHubCheckRun,
  type GitHubClient,
  type GitHubCompare,
  GitHubError,
  type GitHubPull,
  type GitHubTag,
} from '../src/releases/github.js'

interface RepoState {
  branches: string[]
  pulls: GitHubPull[]
  compare: Record<string, GitHubCompare>
  checks: Record<string, GitHubCheckRun[]>
  tags: GitHubTag[]
  mergeable: Record<number, boolean | null>
}

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
      ...state,
    })
    return this
  }

  private state(repo: string): RepoState {
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
    if (!this.state(repo).branches.includes(ref)) throw new GitHubError(422, 'no commit found')
    return this.state(repo).checks[ref] ?? []
  }

  async tags(repo: string) {
    this.calls.push(`tags ${repo}`)
    return this.state(repo).tags
  }
}
