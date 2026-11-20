import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchPullRequests, isBot, parseSignal, toPullRequest } from '../src/github.js'
import { fetchJiraTasks, loadFixtureTasks } from '../src/tasks.js'

const raw = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  title: 'feat: scans',
  url: 'https://github.com/o/r/pull/7',
  state: 'OPEN',
  isDraft: false,
  createdAt: '2026-11-20T10:00:00Z',
  mergedAt: null,
  updatedAt: '2026-11-20T12:00:00Z',
  additions: 10,
  deletions: 2,
  headRefName: 'feat/LAB-10-scans',
  baseRefName: 'develop',
  author: { login: 'ana' },
  labels: { nodes: [{ name: 'risk:infra' }] },
  reviewRequests: {
    nodes: [
      { requestedReviewer: { login: 'bruno' } },
      { requestedReviewer: { slug: 'platform' } },
      { requestedReviewer: null },
    ],
  },
  reviews: {
    nodes: [
      {
        author: { login: 'bruno' },
        state: 'APPROVED',
        submittedAt: '2026-11-20T11:00:00Z',
        comments: { totalCount: 3 },
      },
      { author: null, state: 'COMMENTED', submittedAt: null, comments: { totalCount: 0 } },
    ],
  },
  comments: {
    nodes: [
      {
        author: { login: 'github-actions' },
        body: '<!-- eng-platform-lab:ai-review -->\n**Sinal:** Pendências antes do merge',
      },
    ],
  },
  timelineItems: { nodes: [{ createdAt: '2026-11-20T10:30:00Z' }] },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  ...overrides,
})

describe('GitHub', () => {
  it('converte o PR, com task, sinal do bot e revisores', () => {
    expect(toPullRequest(raw() as never)).toMatchObject({
      readyAt: '2026-11-20T10:30:00Z',
      taskKey: 'LAB-10',
      botSignal: 'gate',
      requestedReviewers: ['bruno', 'platform'],
      reviews: [{ author: 'bruno', comments: 3 }],
      checks: 'SUCCESS',
      labels: ['risk:infra'],
    })
  })

  it('usa a criação quando não houve evento de pronto e aceita PR sem bot e sem checks', () => {
    const pr = toPullRequest(
      raw({
        timelineItems: { nodes: [] },
        comments: { nodes: [] },
        commits: { nodes: [] },
        author: null,
        headRefName: 'x',
        title: 'y',
      }) as never,
    )
    expect(pr).toMatchObject({
      readyAt: '2026-11-20T10:00:00Z',
      botSignal: null,
      checks: null,
      author: 'desconhecido',
      taskKey: null,
    })
  })

  it('lê o sinal do comentário e reconhece bots', () => {
    expect(parseSignal('**Sinal:** Ajustes recomendados')).toBe('ajustes')
    expect(parseSignal('**Sinal:** Gate pendente')).toBe('gate')
    expect(parseSignal('**Sinal:** Pronto para revisão humana')).toBe('pronto')
    expect(parseSignal('sem sinal')).toBeNull()
    expect(isBot('dependabot[bot]')).toBe(true)
    expect(isBot('github-actions')).toBe(true)
    expect(isBot('ana')).toBe(false)
  })

  it('pagina até achar PR mais antigo que a janela', async () => {
    const page = (nodes: unknown[], hasNextPage: boolean) =>
      Response.json({
        data: {
          repository: { pullRequests: { pageInfo: { hasNextPage, endCursor: 'c' }, nodes } },
        },
      })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page([raw({ number: 1 })], true))
      .mockResolvedValueOnce(
        page([raw({ number: 2 }), raw({ number: 3, updatedAt: '2026-01-01T00:00:00Z' })], true),
      )
    const prs = await fetchPullRequests({
      token: 't',
      repository: 'o/r',
      since: '2026-10-01T00:00:00Z',
      fetchImpl,
    })
    expect(prs.map((p) => p.number)).toEqual([1, 2])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('propaga erro HTTP e erro do GraphQL', async () => {
    const http = vi.fn(async () => new Response('', { status: 401 }))
    await expect(
      fetchPullRequests({ token: 't', repository: 'o/r', since: '', fetchImpl: http }),
    ).rejects.toThrow('401')
    const graph = vi.fn(async () => Response.json({ errors: [{ message: 'sem acesso' }] }))
    await expect(
      fetchPullRequests({ token: 't', repository: 'o/r', since: '', fetchImpl: graph }),
    ).rejects.toThrow('sem acesso')
    const empty = vi.fn(async () => Response.json({}))
    expect(
      await fetchPullRequests({ token: 't', repository: 'o/r', since: '', fetchImpl: empty }),
    ).toEqual([])
  })
})

describe('tasks', () => {
  it('lê fixtures com status, critérios e histórico', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
    await writeFile(
      join(dir, 'A-1.json'),
      JSON.stringify({
        key: 'A-1',
        title: 't',
        status: 'Pronta',
        acceptanceCriteria: ['x'],
        statusHistory: [{ status: 'Pronta', at: 'd' }],
      }),
    )
    await writeFile(join(dir, 'A-2.json'), JSON.stringify({ key: 'A-2', title: 't2' }))
    expect(await loadFixtureTasks(dir)).toEqual([
      {
        key: 'A-1',
        title: 't',
        status: 'Pronta',
        acceptanceCriteria: 1,
        statusHistory: [{ status: 'Pronta', at: 'd' }],
      },
      { key: 'A-2', title: 't2', status: 'desconhecido', acceptanceCriteria: 0, statusHistory: [] },
    ])
  })

  it('lê status e histórico de transições do Jira só com GET', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          key: 'MDI-1',
          fields: { summary: 'Título', status: { name: 'Code Review' } },
          changelog: {
            histories: [
              {
                created: '2026-11-19T10:00:00Z',
                items: [{ field: 'status', toString: 'Code Review' }],
              },
              {
                created: '2026-11-18T10:00:00Z',
                items: [
                  { field: 'status', toString: 'Em andamento' },
                  { field: 'assignee', toString: 'x' },
                ],
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 404 }))
    const tasks = await fetchJiraTasks(['MDI-1', 'MDI-2'], {
      site: 's.atlassian.net',
      email: 'e',
      apiToken: 't',
      fetchImpl,
    })
    expect(tasks).toEqual([
      {
        key: 'MDI-1',
        title: 'Título',
        status: 'Code Review',
        acceptanceCriteria: -1,
        statusHistory: [
          { status: 'Em andamento', at: '2026-11-18T10:00:00Z' },
          { status: 'Code Review', at: '2026-11-19T10:00:00Z' },
        ],
      },
    ])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('expand=changelog')
    expect(init.method).toBe('GET')

    const failing = vi.fn(async () => new Response('', { status: 500 }))
    await expect(
      fetchJiraTasks(['X-1'], { site: 's', email: 'e', apiToken: 't', fetchImpl: failing }),
    ).rejects.toThrow('500')
  })
})
