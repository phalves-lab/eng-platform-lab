import { describe, expect, it } from 'vitest'
import { createRestGitHub, GitHubError } from '../src/releases/github.js'
import { createRestGitHubWriter } from '../src/releases/github-writer.js'

const SHA = 'a'.repeat(40)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

interface Sent {
  method: string
  path: string
  body: unknown
  auth: string | null
}

const recorder = (routes: (method: string, url: URL) => Response) => {
  const requests: Sent[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push({
      method,
      path: url.pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    })
    return Promise.resolve(routes(method, url))
  }
  return { requests, fetchImpl: fetchImpl as typeof fetch }
}

const ALLOWED = [
  /^GET \/repos\/acme\/api\/git\/ref\/(heads|tags)\//,
  /^POST \/repos\/acme\/api\/git\/refs$/,
  /^POST \/repos\/acme\/api\/pulls$/,
  /^PATCH \/repos\/acme\/api\/pulls\/\d+$/,
  /^POST \/repos\/acme\/api\/issues\/\d+\/(labels|assignees)$/,
  /^POST \/repos\/acme\/api\/releases$/,
]

describe('REST GitHub writer', () => {
  it('only creates refs, PRs and releases and edits the PR body, never merging or pushing', async () => {
    const { requests, fetchImpl } = recorder((method, url) => {
      if (method === 'GET') return json({ message: 'Not Found' }, 404)
      if (url.pathname.endsWith('/pulls')) return json({ number: 7, html_url: 'https://gh/pr/7' })
      if (url.pathname.endsWith('/releases')) return json({ html_url: 'https://gh/rel/v1' })
      return json({})
    })
    const writer = createRestGitHubWriter({ token: 'w', apiUrl: 'https://api.example', fetchImpl })

    await writer.createBranch('acme/api', 'release/2026-11-21', SHA)
    expect(
      await writer.createPull('acme/api', {
        head: 'release/2026-11-21',
        base: 'main',
        title: 't',
        body: 'b',
      }),
    ).toEqual({ number: 7, url: 'https://gh/pr/7' })
    await writer.updatePullBody('acme/api', 7, 'novo corpo')
    await writer.addLabels('acme/api', 7, ['release'])
    await writer.addLabels('acme/api', 7, [])
    await writer.addAssignees('acme/api', 7, ['ana'])
    await writer.addAssignees('acme/api', 7, [])
    await writer.createTag('acme/api', 'release-2026-11-21', SHA)
    expect(
      await writer.createRelease('acme/api', { tag: 'release-2026-11-21', name: 'n', body: 'b' }),
    ).toEqual({ url: 'https://gh/rel/v1' })

    for (const request of requests) {
      const line = `${request.method} ${request.path}`
      expect(
        ALLOWED.some((pattern) => pattern.test(line)),
        line,
      ).toBe(true)
      expect(request.auth).toBe('Bearer w')
    }
    expect(requests.some((request) => request.path.includes('/merge'))).toBe(false)
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /repos/acme/api/git/ref/heads/release/2026-11-21',
      'POST /repos/acme/api/git/refs',
      'POST /repos/acme/api/pulls',
      'PATCH /repos/acme/api/pulls/7',
      'POST /repos/acme/api/issues/7/labels',
      'POST /repos/acme/api/issues/7/assignees',
      'GET /repos/acme/api/git/ref/tags/release-2026-11-21',
      'POST /repos/acme/api/git/refs',
      'POST /repos/acme/api/releases',
    ])
    expect(requests[1]?.body).toEqual({ ref: 'refs/heads/release/2026-11-21', sha: SHA })
    expect(requests[3]?.body).toEqual({ body: 'novo corpo' })
    expect(requests[7]?.body).toEqual({ ref: 'refs/tags/release-2026-11-21', sha: SHA })
  })

  it('refuses existing refs, protected or foreign branch names and bad input before writing', async () => {
    const { requests, fetchImpl } = recorder((method) =>
      method === 'GET' ? json({ ref: 'x' }) : json({}, 500),
    )
    const writer = createRestGitHubWriter({ token: 'w', fetchImpl })
    await expect(writer.createBranch('acme/api', 'release/x', SHA)).rejects.toMatchObject({
      status: 409,
    })
    await expect(writer.createTag('acme/api', 'v1.0.0', SHA)).rejects.toMatchObject({
      status: 409,
    })
    for (const branch of ['main', 'develop', 'feat/LAB-1-x', 'release/../main']) {
      await expect(writer.createBranch('acme/api', branch, SHA)).rejects.toBeInstanceOf(GitHubError)
    }
    await expect(writer.createBranch('acme/api', 'release/y', 'abc')).rejects.toThrow('SHA')
    await expect(writer.createTag('acme/api', '-bad tag', SHA)).rejects.toThrow('tag')
    await expect(
      writer.createRelease('acme/api', { tag: 'a b', name: 'n', body: 'b' }),
    ).rejects.toThrow('tag')
    await expect(
      writer.createPull('acme/api', { head: 'main', base: 'main', title: 't', body: 'b' }),
    ).rejects.toThrow('iguais')
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  it('surfaces GitHub errors with the status', async () => {
    const { fetchImpl } = recorder((method) => (method === 'GET' ? json({}, 500) : json({}, 422)))
    const writer = createRestGitHubWriter({ token: 'w', fetchImpl })
    await expect(writer.createBranch('acme/api', 'release/z', SHA)).rejects.toMatchObject({
      status: 500,
    })
    await expect(writer.updatePullBody('acme/api', 1, 'x')).rejects.toMatchObject({ status: 422 })
  })
})

describe('REST GitHub client lookups for writes and tracking', () => {
  it('reads branch heads, PR details, reviews, workflow runs and tags with GET only', async () => {
    const { requests, fetchImpl } = recorder((_method, url) => {
      const path = url.pathname
      if (path.endsWith('/branches/develop')) {
        return json({
          commit: { sha: SHA, commit: { committer: { date: '2026-11-20T00:00:00Z' } } },
        })
      }
      if (path.endsWith('/branches/old'))
        return json({ commit: { sha: SHA, commit: { committer: null } } })
      if (path.endsWith('/pulls/5')) {
        return json({
          number: 5,
          title: 'chore(release): release',
          html_url: 'https://gh/pr/5',
          body: null,
          state: 'closed',
          merged: true,
          merged_at: '2026-11-21T00:00:00Z',
          merge_commit_sha: SHA,
          mergeable: null,
          head: { ref: 'develop', sha: SHA },
          base: { ref: 'main' },
        })
      }
      if (path.endsWith('/pulls/5/reviews')) {
        return json([
          { user: { login: 'rev' }, state: 'APPROVED', submitted_at: '2026-11-21T00:00:00Z' },
          { user: null, state: 'COMMENTED', submitted_at: null },
        ])
      }
      if (path.includes('/actions/workflows/release-summary.yml/runs')) {
        return json({
          workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'https://ci/9' }],
        })
      }
      if (path.endsWith('/git/ref/tags/v1')) return json({ ref: 'refs/tags/v1' })
      if (path.includes('/actions/workflows/missing.yml')) return json({}, 404)
      if (path.endsWith('/git/ref/tags/boom')) return json({}, 500)
      return json({}, 404)
    })
    const github = createRestGitHub({ token: 'r', fetchImpl })
    expect(await github.branchHead('acme/api', 'develop')).toEqual({
      sha: SHA,
      date: '2026-11-20T00:00:00Z',
    })
    expect(await github.branchHead('acme/api', 'old')).toEqual({ sha: SHA, date: null })
    expect(await github.branchHead('acme/api', 'nope')).toBeNull()
    expect(await github.pull('acme/api', 5)).toMatchObject({
      body: '',
      headSha: SHA,
      merged: true,
      mergeSha: SHA,
      state: 'closed',
    })
    expect(await github.reviews('acme/api', 5)).toEqual([
      { author: 'rev', state: 'APPROVED', submittedAt: '2026-11-21T00:00:00Z' },
      { author: 'desconhecido', state: 'COMMENTED', submittedAt: null },
    ])
    expect(await github.workflowRuns('acme/api', 'release-summary.yml', 'release/x')).toEqual([
      { status: 'completed', conclusion: 'success', url: 'https://ci/9' },
    ])
    expect(await github.workflowRuns('acme/api', 'missing.yml', 'develop')).toEqual([])
    expect(await github.tagExists('acme/api', 'v1')).toBe(true)
    expect(await github.tagExists('acme/api', 'v2')).toBe(false)
    await expect(github.tagExists('acme/api', 'boom')).rejects.toMatchObject({ status: 500 })
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })
})
