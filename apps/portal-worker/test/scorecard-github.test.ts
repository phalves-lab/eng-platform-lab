import { RepoCatalogEntrySchema } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  createGitHubRepoSource,
  GitHubReadError,
} from '../src/collectors/scorecard/github-source.js'

const API = 'https://api.example.test'
const REPO = '/repos/lab-ficticio/pedidos'

const entry = RepoCatalogEntrySchema.parse({
  id: 'pedidos',
  repo: 'lab-ficticio/pedidos',
  name: 'Pedidos',
  team: 'Vendas',
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

const file = (content: string) => ({
  name: 'f',
  path: 'f',
  type: 'file',
  encoding: 'base64',
  content: Buffer.from(content).toString('base64'),
})

type Routes = Record<string, () => Response>

const fakeGitHub = (routes: Routes) => {
  const requests: { url: string; method: string; auth: string | null }[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({
      url,
      method: init?.method ?? 'GET',
      auth: new Headers(init?.headers).get('authorization'),
    })
    const key = url.replace(API, '')
    const route = routes[key] ?? routes[key.split('?')[0] ?? '']
    return Promise.resolve(route ? route() : json({ message: 'Not Found' }, 404))
  }
  return { requests, fetchImpl: fetchImpl as typeof fetch }
}

const healthy: Routes = {
  [REPO]: () =>
    json({
      default_branch: 'main',
      security_and_analysis: {
        secret_scanning: { status: 'enabled' },
        secret_scanning_push_protection: { status: 'disabled' },
      },
    }),
  [`${REPO}/branches/main`]: () => json({ name: 'main' }),
  [`${REPO}/rules/branches/main?per_page=100`]: () =>
    json([{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'merge_queue' }], 200, {
      link: `<${API}${REPO}/rules/branches/main?per_page=100&page=2>; rel="next", <${API}/x>; rel="last"`,
    }),
  [`${REPO}/rules/branches/main?per_page=100&page=2`]: () => json([{ type: 'pull_request' }]),
  [`${REPO}/branches/main/protection`]: () => json({ message: 'Branch not protected' }, 404),
  [`${REPO}/branches/develop`]: () => json({ name: 'develop' }),
  [`${REPO}/rules/branches/develop?per_page=100`]: () => json([]),
  [`${REPO}/branches/develop/protection`]: () =>
    json({
      required_pull_request_reviews: {},
      allow_force_pushes: { enabled: true },
      allow_deletions: { enabled: false },
    }),
  [`${REPO}/contents/.github/workflows`]: () =>
    json([
      { name: 'ci.yml', path: '.github/workflows/ci.yml', type: 'file' },
      { name: 'README.md', path: '.github/workflows/README.md', type: 'file' },
      { name: 'old', path: '.github/workflows/old', type: 'dir' },
    ]),
  [`${REPO}/contents/.github/workflows/ci.yml`]: () =>
    json(file('jobs:\n  gates:\n    uses: ./.github/workflows/verify.yml\n')),
  [`${REPO}/contents/AGENTS.md`]: () => json(file('# Agentes')),
  [`${REPO}/commits?path=AGENTS.md&per_page=1`]: () =>
    json([{ commit: { committer: { date: '2026-11-01T10:00:00Z' } } }]),
  [`${REPO}/contents/.nvmrc`]: () => json(file('v22.11.0\n')),
  [`${REPO}/dependabot/alerts?state=open&per_page=100`]: () =>
    json([
      { security_advisory: { severity: 'critical' } },
      { security_vulnerability: { severity: 'moderate' } },
      { security_advisory: null },
    ]),
  [`${REPO}/code-scanning/alerts?state=open&per_page=100`]: () =>
    json([{ rule: { security_severity_level: 'high' } }, { rule: { severity: 'warning' } }], 200, {
      link: `<${API}${REPO}/code-scanning/alerts?page=2>; rel="next"`,
    }),
  [`${REPO}/code-scanning/alerts?page=2`]: () => json([{ rule: { severity: 'note' } }]),
  [`${REPO}/labels?per_page=100`]: () => json([{ name: 'release' }, { name: 'bug' }]),
}

describe('adaptador GitHub do scorecard', () => {
  it('só faz GET autenticado e monta os fatos de rulesets, proteção clássica e conteúdo', async () => {
    const { requests, fetchImpl } = fakeGitHub(healthy)
    const source = createGitHubRepoSource({ token: 't0k', apiUrl: `${API}/`, fetchImpl })
    const facts = await source.facts(entry)

    expect(requests.every((request) => request.method === 'GET')).toBe(true)
    expect(requests.every((request) => request.auth === 'Bearer t0k')).toBe(true)
    expect(requests.every((request) => request.url.startsWith(API))).toBe(true)
    expect(facts.defaultBranch).toBe('main')
    expect(facts.branches).toEqual([
      {
        name: 'main',
        exists: true,
        protection: 'ruleset',
        requiresPullRequest: true,
        blocksForcePush: true,
        blocksDeletion: true,
        mergeQueue: true,
      },
      {
        name: 'develop',
        exists: true,
        protection: 'classic',
        requiresPullRequest: true,
        blocksForcePush: false,
        blocksDeletion: true,
        mergeQueue: false,
      },
    ])
    expect(facts.workflows).toEqual([
      {
        path: '.github/workflows/ci.yml',
        content: 'jobs:\n  gates:\n    uses: ./.github/workflows/verify.yml\n',
      },
    ])
    expect(facts.agentsMd).toEqual({ present: true, updatedAt: '2026-11-01T10:00:00.000Z' })
    expect(facts.nvmrc).toBe('v22.11.0')
    expect(facts.secretScanning).toEqual({ secretScanning: true, pushProtection: false })
    expect(facts.dependabotAlerts).toEqual({ critical: 1, high: 0, medium: 1, low: 1 })
    expect(facts.codeScanning).toEqual({
      enabled: true,
      alerts: { critical: 0, high: 1, medium: 1, low: 1 },
    })
    expect(facts.labels).toEqual(['release', 'bug'])
  })

  it('trata 403 e 404 de leituras opcionais como dado ausente ou ilegível', async () => {
    const { fetchImpl } = fakeGitHub({
      [REPO]: () => json({ default_branch: 'trunk' }),
      [`${REPO}/branches/trunk`]: () => json({ name: 'trunk' }),
      [`${REPO}/rules/branches/trunk?per_page=100`]: () => json([{ type: 'pull_request' }]),
      [`${REPO}/branches/trunk/protection`]: () => json({ message: 'Forbidden' }, 403),
      [`${REPO}/dependabot/alerts?state=open&per_page=100`]: () => json({}, 403),
      [`${REPO}/code-scanning/alerts?state=open&per_page=100`]: () => json({}, 403),
      [`${REPO}/labels?per_page=100`]: () => json([]),
    })
    const facts = await createGitHubRepoSource({ token: 't', apiUrl: API, fetchImpl }).facts(entry)

    expect(facts.branches).toEqual([
      expect.objectContaining({ name: 'trunk', protection: 'unknown', requiresPullRequest: true }),
      expect.objectContaining({ name: 'develop', exists: false, protection: 'none' }),
    ])
    expect(facts).toMatchObject({
      workflows: [],
      agentsMd: { present: false, updatedAt: null },
      nvmrc: null,
      secretScanning: { secretScanning: null, pushProtection: null },
      dependabotAlerts: null,
      codeScanning: null,
      labels: [],
    })
  })

  it('distingue code scanning desligado e não segue link de outro host', async () => {
    const { requests, fetchImpl } = fakeGitHub({
      [REPO]: () => json({ default_branch: 'main', security_and_analysis: null }),
      [`${REPO}/branches/main`]: () => json({ name: 'main' }, 200),
      [`${REPO}/rules/branches/main?per_page=100`]: () => json({}, 404),
      [`${REPO}/branches/main/protection`]: () =>
        json({ allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } }),
      [`${REPO}/contents/AGENTS.md`]: () => json(file('x')),
      [`${REPO}/commits?path=AGENTS.md&per_page=1`]: () => json([]),
      [`${REPO}/labels?per_page=100`]: () =>
        json([{ name: 'release' }], 200, { link: '<https://evil.example/labels>; rel="next"' }),
    })
    const facts = await createGitHubRepoSource({ token: 't', apiUrl: API, fetchImpl }).facts({
      ...entry,
      integrationBranch: 'main',
    })

    expect(facts.branches).toEqual([
      expect.objectContaining({ protection: 'classic', requiresPullRequest: false }),
    ])
    expect(facts.agentsMd).toEqual({ present: true, updatedAt: null })
    expect(facts.codeScanning).toEqual({ enabled: false })
    expect(facts.labels).toEqual(['release'])
    expect(requests.some((request) => request.url.includes('evil.example'))).toBe(false)
  })

  it('falha o repositório em limite de requisições e erro do servidor', async () => {
    const limited = fakeGitHub({
      [REPO]: () => json({}, 403, { 'x-ratelimit-remaining': '0' }),
    })
    const error = await createGitHubRepoSource({
      token: 't',
      apiUrl: API,
      fetchImpl: limited.fetchImpl,
    })
      .facts(entry)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GitHubReadError)
    expect(error).toMatchObject({
      status: 429,
      message: `GitHub respondeu limite de requisições em ${REPO}`,
    })

    const broken = fakeGitHub({
      ...healthy,
      [`${REPO}/labels?per_page=100`]: () => json({}, 502),
    })
    await expect(
      createGitHubRepoSource({ token: 't', apiUrl: API, fetchImpl: broken.fetchImpl }).facts(entry),
    ).rejects.toMatchObject({ status: 502, message: `GitHub respondeu 502 em ${REPO}/labels` })

    const throttled = fakeGitHub({
      ...healthy,
      [`${REPO}/dependabot/alerts?state=open&per_page=100`]: () =>
        json({}, 403, { 'x-ratelimit-remaining': '0' }),
    })
    await expect(
      createGitHubRepoSource({ token: 't', apiUrl: API, fetchImpl: throttled.fetchImpl }).facts(
        entry,
      ),
    ).rejects.toMatchObject({ status: 429 })
  })
})
