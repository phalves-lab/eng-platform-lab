import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TtlCache, withCache } from '../src/releases/cache.js'
import { loadReleaseCatalog } from '../src/releases/catalog.js'
import { createRestGitHub, GitHubError } from '../src/releases/github.js'
import { FakeGitHub } from './fake-github.js'

const rawPull = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/acme/api/pull/${number}`,
  body: null,
  user: { login: 'ana' },
  head: { ref: `feat/LAB-${number}-x` },
  base: { ref: 'develop' },
  labels: [{ name: 'release' }],
  merged_at: '2026-11-10T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  ...extra,
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

const recorder = (routes: (url: URL) => Response) => {
  const requests: { url: URL; method: string; auth: string | null }[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    requests.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization') })
    return Promise.resolve(routes(url))
  }
  return { requests, fetchImpl: fetchImpl as typeof fetch }
}

describe('REST GitHub client', () => {
  it('only issues authenticated GET requests and maps every read', async () => {
    const { requests, fetchImpl } = recorder((url) => {
      const path = url.pathname
      if (path.endsWith('/compare/main...develop')) return json({ ahead_by: 4, behind_by: 1 })
      if (path.endsWith('/pulls/9')) return json({ mergeable: false })
      if (path.endsWith('/pulls')) {
        const state = url.searchParams.get('state')
        if (state === 'open') return json([rawPull(9, { merged_at: null })])
        return json([
          rawPull(3, { merged_at: '2026-11-12T00:00:00Z', updated_at: '2026-11-12T00:00:00Z' }),
          rawPull(2, { merged_at: null, updated_at: '2026-11-11T00:00:00Z' }),
          rawPull(1, { merged_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }),
        ])
      }
      if (path.endsWith('/branches')) return json([{ name: 'main' }, { name: 'develop' }])
      if (path.includes('/check-runs')) {
        return json({
          check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success', id: 1 }],
        })
      }
      if (path.endsWith('/tags')) return json([{ name: 'v1.0.0', commit: { sha: 'abc' } }])
      if (path.endsWith('/commits/abc')) {
        return json({ commit: { committer: { date: '2026-10-01T00:00:00Z' } } })
      }
      return json({ message: 'Not Found' }, 404)
    })
    const github = createRestGitHub({ token: 't0k', apiUrl: 'https://api.example', fetchImpl })

    expect(await github.compare('acme/api', 'main', 'develop')).toEqual({ aheadBy: 4, behindBy: 1 })
    const merged = await github.mergedPulls('acme/api', 'develop', '2026-11-05T00:00:00Z')
    expect(merged.map((item) => item.number)).toEqual([3])
    expect(merged[0]).toMatchObject({
      author: 'ana',
      body: '',
      labels: ['release'],
      baseRef: 'develop',
    })
    expect(
      (await github.mergedPulls('acme/api', 'develop', null)).map((item) => item.number),
    ).toEqual([3, 1])
    expect((await github.openPulls('acme/api', 'main'))[0]?.number).toBe(9)
    expect(await github.mergeable('acme/api', 9)).toBe(false)
    expect(await github.branches('acme/api')).toEqual(['main', 'develop'])
    expect(await github.checkRuns('acme/api', 'feat/x y')).toEqual([
      { name: 'ci', status: 'completed', conclusion: 'success' },
    ])
    expect(await github.tags('acme/api')).toEqual([
      {
        name: 'v1.0.0',
        date: '2026-10-01T00:00:00Z',
        url: 'https://github.com/acme/api/releases/tag/v1.0.0',
      },
    ])

    expect(requests.every((request) => request.method === 'GET')).toBe(true)
    expect(requests.every((request) => request.auth === 'Bearer t0k')).toBe(true)
    expect(requests.every((request) => request.url.origin === 'https://api.example')).toBe(true)
    expect(requests.some((request) => request.url.pathname.includes('feat%2Fx%20y'))).toBe(true)
  })

  it('pages pulls until the cutoff and translates errors', async () => {
    let page = 0
    const { fetchImpl } = recorder((url) => {
      if (url.pathname.endsWith('/branches')) {
        page += 1
        return json(
          Array.from({ length: page === 1 ? 100 : 3 }, (_, i) => ({ name: `b${page}-${i}` })),
        )
      }
      if (url.pathname.endsWith('/pulls')) {
        const current = Number(url.searchParams.get('page'))
        return json(
          Array.from({ length: 100 }, (_, i) =>
            rawPull(current * 1000 + i, {
              updated_at: current === 1 ? '2026-11-20T00:00:00Z' : '2026-10-01T00:00:00Z',
            }),
          ),
        )
      }
      if (url.pathname.endsWith('/tags')) return json({}, 403, { 'x-ratelimit-remaining': '0' })
      if (url.pathname.endsWith('/compare/main...develop')) return json({}, 401)
      return json({}, 500)
    })
    const github = createRestGitHub({ token: 't', fetchImpl })
    expect(await github.branches('acme/api')).toHaveLength(103)
    expect(await github.mergedPulls('acme/api', 'develop', '2026-11-01T00:00:00Z')).toHaveLength(
      200,
    )
    await expect(github.tags('acme/api')).rejects.toMatchObject({ status: 429 })
    await expect(github.compare('acme/api', 'main', 'develop')).rejects.toMatchObject({
      status: 401,
    })
    await expect(github.mergeable('acme/api', 1)).rejects.toBeInstanceOf(GitHubError)
  })
})

describe('GitHub cache', () => {
  it('memoizes reads for the TTL, shares in-flight calls and never caches failures', async () => {
    let now = 0
    const fake = new FakeGitHub().repo('acme/api', { branches: ['main'] })
    const github = withCache(fake, new TtlCache(1000, () => now))
    await Promise.all([github.branches('acme/api'), github.branches('acme/api')])
    await github.branches('acme/api')
    expect(fake.calls).toEqual(['branches acme/api'])
    now = 1001
    await github.branches('acme/api')
    expect(fake.calls).toHaveLength(2)
    await expect(github.branches('acme/nope')).rejects.toBeInstanceOf(GitHubError)
    await expect(github.branches('acme/nope')).rejects.toBeInstanceOf(GitHubError)
    expect(fake.calls.filter((call) => call === 'branches acme/nope')).toHaveLength(2)
  })

  it('drops expired entries once the cache grows', async () => {
    let now = 0
    const cache = new TtlCache(10, () => now)
    for (let i = 0; i < 500; i += 1) await cache.get(`k${i}`, () => Promise.resolve(i))
    now = 100
    let loads = 0
    const load = () => {
      loads += 1
      return Promise.resolve(loads)
    }
    await cache.get('k0', load)
    await cache.get('k0', load)
    expect(loads).toBe(1)
  })
})

describe('release catalog', () => {
  it('loads YAML projects and fails on invalid files or repeated ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'releases-'))
    expect(loadReleaseCatalog(join(dir, 'missing'))).toEqual([])
    await writeFile(join(dir, 'a.yaml'), 'id: a\nname: A\nrepos:\n  back: acme/api\n')
    await writeFile(join(dir, 'notes.txt'), 'ignored')
    expect(loadReleaseCatalog(dir).map((project) => project.id)).toEqual(['a'])
    await writeFile(join(dir, 'b.yml'), 'id: a\nname: B\nrepos:\n  front: acme/web\n')
    expect(() => loadReleaseCatalog(dir)).toThrow('repete o id a em b.yml')
    await writeFile(join(dir, 'b.yml'), 'id: b\nname: B\nrepos: {}\n')
    expect(() => loadReleaseCatalog(dir)).toThrow('Catálogo de releases inválido em b.yml')
  })
})
