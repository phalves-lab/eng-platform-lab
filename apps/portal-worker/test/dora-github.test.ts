import type { DoraRepo } from '@lab/dora'
import { describe, expect, it } from 'vitest'
import { GitHubReadError, createGitHubSource } from '../src/collectors/dora/github-source.js'

const SINCE = '2026-11-01T00:00:00.000Z'
const API = 'https://github.example.invalid'

const repo = (source: DoraRepo['source']): DoraRepo => ({
  repo: 'lab-demo/campanhas-api',
  team: 'Campanhas',
  system: 'campanhas',
  productionEnvironment: 'production',
  defaultBranch: 'main',
  source,
})

const sha = (char: string) => char.repeat(40)

type Route = (url: URL) => unknown

/** Fake GitHub: answers by path, records every request and fails on unknown paths. */
const fakeGitHub = (
  routes: Record<string, Route>,
  status = 200,
  headers: Record<string, string> = {},
) => {
  const calls: { url: URL; method: string; auth: string | null }[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(String(input))
    calls.push({
      url,
      method: init?.method ?? 'GET',
      auth: new Headers(init?.headers).get('Authorization'),
    })
    const route = routes[url.pathname]
    if (!route) return Promise.resolve(new Response('not found', { status: 404 }))
    return Promise.resolve(new Response(JSON.stringify(route(url)), { status, headers }))
  }
  return { calls, fetchImpl }
}

const noPulls = { '/repos/lab-demo/campanhas-api/pulls': () => [] }

describe('GitHub DORA source', () => {
  it('reads production deployments with their final status and the commits each one shipped', async () => {
    const github = fakeGitHub({
      ...noPulls,
      '/repos/lab-demo/campanhas-api/deployments': (url) => {
        expect(url.searchParams.get('environment')).toBe('production')
        return [
          { id: 4, sha: sha('d'), created_at: '2026-11-19T10:00:00Z' },
          { id: 3, sha: sha('c'), created_at: '2026-11-18T10:00:00Z' },
          {
            id: 2,
            sha: sha('b'),
            created_at: '2026-11-17T10:00:00Z',
            payload: { deployedAt: '2026-11-17T10:05:00Z' },
          },
          { id: 1, sha: sha('a'), created_at: '2026-11-16T10:00:00Z' },
          { id: 0, sha: sha('0'), created_at: '2026-10-20T10:00:00Z' },
        ]
      },
      '/repos/lab-demo/campanhas-api/deployments/1/statuses': () => [
        { state: 'inactive', created_at: '2026-11-17T10:06:00Z' },
        {
          state: 'success',
          created_at: '2026-11-16T10:04:00Z',
          log_url: 'https://example.invalid/runs/1',
        },
      ],
      '/repos/lab-demo/campanhas-api/deployments/2/statuses': () => [
        {
          state: 'failure',
          description: 'eng-metrics:rolled_back',
          created_at: '2026-11-17T12:00:00Z',
        },
      ],
      '/repos/lab-demo/campanhas-api/deployments/3/statuses': () => [
        { state: 'error', created_at: '2026-11-18T10:03:00Z', target_url: 'javascript:alert(1)' },
      ],
      '/repos/lab-demo/campanhas-api/deployments/4/statuses': () => [
        { state: 'in_progress', created_at: '2026-11-19T10:01:00Z' },
      ],
      [`/repos/lab-demo/campanhas-api/compare/${sha('a')}...${sha('b')}`]: () => ({
        commits: [{ sha: sha('e') }, { sha: sha('b') }],
      }),
    })
    const source = createGitHubSource({
      token: 't0k',
      apiUrl: `${API}/`,
      fetchImpl: github.fetchImpl,
    })

    const result = await source.collect(repo({ type: 'github-deployments' }), SINCE)

    expect(result.deploys).toEqual([
      {
        repo: 'lab-demo/campanhas-api',
        environment: 'production',
        sha: sha('a'),
        deployedAt: '2026-11-16T10:04:00Z',
        status: 'success',
        url: 'https://example.invalid/runs/1',
        commitShas: [sha('a')],
      },
      {
        repo: 'lab-demo/campanhas-api',
        environment: 'production',
        sha: sha('b'),
        deployedAt: '2026-11-17T10:05:00Z',
        status: 'rolled_back',
        url: null,
        commitShas: [sha('e'), sha('b')],
      },
      {
        repo: 'lab-demo/campanhas-api',
        environment: 'production',
        sha: sha('c'),
        deployedAt: '2026-11-18T10:03:00Z',
        status: 'failure',
        url: null,
        commitShas: [],
      },
    ])
    expect(github.calls.every((call) => call.method === 'GET')).toBe(true)
    expect(github.calls.every((call) => call.auth === 'Bearer t0k')).toBe(true)
    expect(github.calls.some((call) => call.url.pathname.endsWith('/deployments/0/statuses'))).toBe(
      false,
    )
  })

  it('reads completed runs of the deploy workflow on the default branch', async () => {
    const github = fakeGitHub({
      ...noPulls,
      '/repos/lab-demo/campanhas-api/actions/workflows/deploy.yml/runs': (url) => {
        expect(url.searchParams.get('branch')).toBe('main')
        expect(url.searchParams.get('status')).toBe('completed')
        expect(url.searchParams.get('created')).toBe('>=2026-11-01')
        return {
          workflow_runs: [
            {
              head_sha: sha('b'),
              conclusion: 'success',
              updated_at: '2026-11-18T10:00:00Z',
              html_url: 'https://example.invalid/runs/2',
            },
            {
              head_sha: sha('b'),
              conclusion: 'success',
              updated_at: '2026-11-18T11:00:00Z',
              html_url: null,
            },
            { head_sha: sha('c'), conclusion: 'cancelled', updated_at: '2026-11-18T12:00:00Z' },
            { head_sha: sha('d'), conclusion: 'failure', updated_at: '2026-11-19T10:00:00Z' },
            { head_sha: sha('9'), conclusion: 'success', updated_at: '2026-10-31T23:00:00Z' },
          ],
        }
      },
    })
    const source = createGitHubSource({ token: 't', apiUrl: API, fetchImpl: github.fetchImpl })

    const { deploys } = await source.collect(
      repo({ type: 'github-workflow', workflow: 'deploy.yml' }),
      SINCE,
    )

    expect(deploys.map((deploy) => [deploy.sha[0], deploy.status, deploy.commitShas])).toEqual([
      ['b', 'success', [sha('b')]],
      ['b', 'success', []],
      ['d', 'failure', []],
    ])
  })

  it('reads merged pull requests with the date of their first commit', async () => {
    const merged = new Set([1, 3, 5])
    const pulls = Array.from({ length: 100 }, (_, index) => {
      const number = index + 1
      const old = number === 100
      return {
        number,
        title: `feat: LAB-${number}`,
        merged_at: old
          ? '2026-10-01T10:00:00Z'
          : merged.has(number)
            ? '2026-11-10T10:00:00Z'
            : null,
        merge_commit_sha: sha(String(number % 10)),
        updated_at: old ? '2026-10-01T10:00:00Z' : '2026-11-20T10:00:00Z',
      }
    })
    const github = fakeGitHub({
      '/repos/lab-demo/campanhas-api/deployments': () => [],
      '/repos/lab-demo/campanhas-api/pulls': (url) => {
        expect(url.searchParams.get('base')).toBe('main')
        expect(url.searchParams.get('state')).toBe('closed')
        return pulls
      },
      '/repos/lab-demo/campanhas-api/pulls/1/commits': () => [
        { commit: { author: { date: '2026-11-08T09:00:00Z' }, committer: null } },
      ],
      '/repos/lab-demo/campanhas-api/pulls/3/commits': () => [
        { commit: { author: null, committer: { date: '2026-11-09T09:00:00Z' } } },
      ],
      '/repos/lab-demo/campanhas-api/pulls/5/commits': () => [],
    })
    const source = createGitHubSource({ token: 't', apiUrl: API, fetchImpl: github.fetchImpl })

    const { changes } = await source.collect(repo({ type: 'github-deployments' }), SINCE)

    expect(changes.map((change) => [change.pullNumber, change.firstCommitAt])).toEqual([
      [1, '2026-11-08T09:00:00Z'],
      [3, '2026-11-09T09:00:00Z'],
      [5, '2026-11-10T10:00:00Z'],
    ])
    expect(changes[0]).toMatchObject({ title: 'feat: LAB-1', mergeSha: sha('1') })
    expect(github.calls.filter((call) => call.url.pathname.endsWith('/pulls'))).toHaveLength(1)
  })

  it('maps rate limits to 429 and other errors to their status', async () => {
    const limited = fakeGitHub(
      { '/repos/lab-demo/campanhas-api/deployments': () => ({ message: 'limit' }) },
      403,
      { 'x-ratelimit-remaining': '0' },
    )
    const source = createGitHubSource({ token: 't', apiUrl: API, fetchImpl: limited.fetchImpl })
    await expect(source.collect(repo({ type: 'github-deployments' }), SINCE)).rejects.toMatchObject(
      {
        status: 429,
        message: 'GitHub respondeu 403 em /repos/lab-demo/campanhas-api/deployments',
      },
    )

    const missing = createGitHubSource({
      token: 't',
      apiUrl: API,
      fetchImpl: fakeGitHub({}).fetchImpl,
    })
    await expect(
      missing.collect(repo({ type: 'github-deployments' }), SINCE),
    ).rejects.toMatchObject({
      status: 404,
    })
    await expect(missing.collect(repo({ type: 'fixture' }), SINCE)).rejects.toThrow(GitHubReadError)
  })
})
