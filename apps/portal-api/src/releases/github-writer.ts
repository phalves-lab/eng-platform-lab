import { GitHubError } from './github.js'

export const GITHUB_WRITER = Symbol('GITHUB_WRITER')

export interface NewPull {
  head: string
  base: string
  title: string
  body: string
}

export interface NewRelease {
  tag: string
  name: string
  body: string
}

/**
 * Every write the portal is allowed to make on GitHub. There is no way to push commits, move an
 * existing ref, merge a PR or change a PR base: branches and tags are only created, never updated.
 */
export interface GitHubWriter {
  createBranch(repo: string, branch: string, sha: string): Promise<void>
  createPull(repo: string, pull: NewPull): Promise<{ number: number; url: string }>
  updatePullBody(repo: string, pullNumber: number, body: string): Promise<void>
  addLabels(repo: string, pullNumber: number, labels: string[]): Promise<void>
  addAssignees(repo: string, pullNumber: number, logins: string[]): Promise<void>
  createTag(repo: string, tag: string, sha: string): Promise<void>
  createRelease(repo: string, release: NewRelease): Promise<{ url: string }>
}

const PROTECTED = new Set([
  'main',
  'master',
  'develop',
  'dev',
  'beta',
  'staging',
  'production',
  'prod',
  'qa',
  'uat',
  'canary',
])
const SHA = /^[0-9a-f]{40}$/
const RELEASE_BRANCH = /^release\/[\w.-]+$/
const TAG = /^\w[\w.-]{0,99}$/

/** Branches the portal may create: a fresh `release/*` name that is never a protected branch. */
export const assertReleaseBranch = (branch: string) => {
  if (PROTECTED.has(branch) || !RELEASE_BRANCH.test(branch)) {
    throw new GitHubError(422, `O portal só cria branches release/*; ${branch} foi recusada.`)
  }
}

export const assertSha = (sha: string) => {
  if (!SHA.test(sha)) throw new GitHubError(422, `SHA inválido: ${sha}`)
}

export const assertTag = (tag: string) => {
  if (!TAG.test(tag)) throw new GitHubError(422, `Nome de tag inválido: ${tag}`)
}

export const assertPullHead = (head: string, base: string) => {
  if (head === base) throw new GitHubError(422, 'Origem e destino da PR iguais.')
}

interface RestOptions {
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}

const refPath = (name: string) => name.split('/').map(encodeURIComponent).join('/')

/**
 * REST adapter over `fetch`. Each method checks its guard before any request and creating a ref
 * first confirms the name is free, so an existing branch or tag is never touched.
 */
export const createRestGitHubWriter = (options: RestOptions): GitHubWriter => {
  const apiUrl = options.apiUrl ?? 'https://api.github.com'
  const fetchImpl = options.fetchImpl ?? fetch

  const send = async <T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.ok) return (await response.json()) as T
    throw new GitHubError(
      response.status,
      `GitHub respondeu ${response.status} em ${method} ${path}`,
    )
  }

  const assertFreeRef = async (repo: string, ref: string) => {
    try {
      await send('GET', `/repos/${repo}/git/ref/${refPath(ref)}`)
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return
      throw error
    }
    throw new GitHubError(409, `${ref} já existe em ${repo}; o portal não altera refs existentes.`)
  }

  return {
    async createBranch(repo, branch, sha) {
      assertReleaseBranch(branch)
      assertSha(sha)
      await assertFreeRef(repo, `heads/${branch}`)
      await send('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha })
    },

    async createPull(repo, pull) {
      assertPullHead(pull.head, pull.base)
      const data = await send<{ number: number; html_url: string }>(
        'POST',
        `/repos/${repo}/pulls`,
        { head: pull.head, base: pull.base, title: pull.title, body: pull.body, draft: false },
      )
      return { number: data.number, url: data.html_url }
    },

    async updatePullBody(repo, pullNumber, body) {
      await send('PATCH', `/repos/${repo}/pulls/${pullNumber}`, { body })
    },

    async addLabels(repo, pullNumber, labels) {
      if (!labels.length) return
      await send('POST', `/repos/${repo}/issues/${pullNumber}/labels`, { labels })
    },

    async addAssignees(repo, pullNumber, logins) {
      if (!logins.length) return
      await send('POST', `/repos/${repo}/issues/${pullNumber}/assignees`, { assignees: logins })
    },

    async createTag(repo, tag, sha) {
      assertTag(tag)
      assertSha(sha)
      await assertFreeRef(repo, `tags/${tag}`)
      await send('POST', `/repos/${repo}/git/refs`, { ref: `refs/tags/${tag}`, sha })
    },

    async createRelease(repo, release) {
      assertTag(release.tag)
      const data = await send<{ html_url: string }>('POST', `/repos/${repo}/releases`, {
        tag_name: release.tag,
        name: release.name,
        body: release.body,
        draft: false,
        prerelease: false,
      })
      return { url: data.html_url }
    },
  }
}
