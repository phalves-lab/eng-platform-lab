import { GitHubError } from '../src/releases/github.js'
import {
  type GitHubWriter,
  type NewPull,
  type NewRelease,
  assertPullHead,
  assertReleaseBranch,
  assertSha,
  assertTag,
} from '../src/releases/github-writer.js'
import { type FakeGitHub, pull } from './fake-github.js'

type Method = keyof GitHubWriter

/**
 * In-memory writer over a `FakeGitHub`: what it writes shows up in the next reads, it applies the
 * same guards as the REST adapter and it can be told to fail on one method.
 */
export class FakeGitHubWriter implements GitHubWriter {
  readonly calls: string[] = []
  private failure: { method: Method; status: number } | null = null
  private nextNumber = 900

  constructor(private readonly github: FakeGitHub) {}

  failOn(method: Method, status = 500): this {
    this.failure = { method, status }
    return this
  }

  private track(method: Method, detail: string) {
    this.calls.push(`${method} ${detail}`)
    if (this.failure?.method === method) {
      throw new GitHubError(this.failure.status, `GitHub respondeu ${this.failure.status}`)
    }
  }

  async createBranch(repo: string, branch: string, sha: string) {
    this.track('createBranch', `${repo} ${branch} ${sha}`)
    assertReleaseBranch(branch)
    assertSha(sha)
    const state = this.github.state(repo)
    if (state.branches.includes(branch)) throw new GitHubError(409, `${branch} já existe`)
    state.branches.push(branch)
    state.heads[branch] = { sha, date: null }
  }

  async createPull(repo: string, input: NewPull) {
    this.track('createPull', `${repo} ${input.head}->${input.base}`)
    assertPullHead(input.head, input.base)
    const state = this.github.state(repo)
    const number = this.nextNumber++
    const url = `https://github.example/${repo}/pull/${number}`
    state.pulls.push(
      pull({
        number,
        title: input.title,
        url,
        body: input.body,
        headRef: input.head,
        baseRef: input.base,
        author: 'portal-bot',
        mergedAt: null,
      }),
    )
    return { number, url }
  }

  async updatePullBody(repo: string, pullNumber: number, body: string) {
    this.track('updatePullBody', `${repo} ${pullNumber}`)
    const found = this.github.state(repo).pulls.find((item) => item.number === pullNumber)
    if (!found) throw new GitHubError(404, 'pull not found')
    found.body = body
  }

  async addLabels(repo: string, pullNumber: number, labels: string[]) {
    this.track('addLabels', `${repo} ${pullNumber} ${labels.join(',')}`)
    const found = this.github.state(repo).pulls.find((item) => item.number === pullNumber)
    if (!found) throw new GitHubError(404, 'pull not found')
    found.labels = [...new Set([...found.labels, ...labels])]
  }

  async addAssignees(repo: string, pullNumber: number, logins: string[]) {
    this.track('addAssignees', `${repo} ${pullNumber} ${logins.join(',')}`)
  }

  async createTag(repo: string, tag: string, sha: string) {
    this.track('createTag', `${repo} ${tag} ${sha}`)
    assertTag(tag)
    assertSha(sha)
    const state = this.github.state(repo)
    if (state.tags.some((item) => item.name === tag)) throw new GitHubError(409, 'tag exists')
    state.tags.push({ name: tag, date: null, url: `https://github.example/${repo}/tree/${tag}` })
  }

  async createRelease(repo: string, release: NewRelease) {
    this.track('createRelease', `${repo} ${release.tag}`)
    return { url: `https://github.example/${repo}/releases/tag/${release.tag}` }
  }
}
