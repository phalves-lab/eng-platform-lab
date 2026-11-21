import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildJql, createCloudJiraSource } from '../src/collectors/jira/cloud-source.js'
import { SEARCH_PATH, createJiraHttp, retryDelayMs } from '../src/collectors/jira/http.js'
import { toIsoInstant } from '../src/collectors/jira/source.js'

const SITE = 'https://jira.example.test'

interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
  headers: Record<string, string>
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> }
type Route = (call: Call) => Reply | undefined

const fakeJira = (route: Route) => {
  const calls: Call[] = []
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(call)
    const reply = route(call) ?? { status: 404, body: {} }
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
        headers: { 'Content-Type': 'application/json', ...reply.headers },
      }),
    )
  }
  return { calls, fetch: fetch as typeof globalThis.fetch }
}

const history = (created: string, items: Record<string, unknown>[]) => ({ created, items })
const statusItem = (from: string, to: string) => ({
  field: 'status',
  fromString: from,
  toString: to,
})

const cloudIssue = (key: string, fields: Record<string, unknown>, changelog?: unknown) => ({
  key,
  fields: {
    summary: `Resumo ${key}`,
    issuetype: { name: 'Story' },
    status: { name: 'Em andamento' },
    components: [{ name: 'Portal' }],
    parent: null,
    assignee: { displayName: 'Pessoa Fictícia' },
    created: '2026-11-02T09:00:00.000-0300',
    resolutiondate: null,
    customfield_10020: null,
    ...fields,
  },
  ...(changelog ? { changelog } : {}),
})

const SPRINTS: Record<string, Reply> = {
  '0': {
    status: 200,
    body: {
      isLast: false,
      values: [
        {
          id: 31,
          name: 'LAB Sprint 1',
          state: 'closed',
          startDate: '2026-10-19T12:00:00.000Z',
          endDate: '2026-11-02T12:00:00.000Z',
          completeDate: '2026-11-02T10:00:00.000Z',
        },
        { id: 39, name: 'Sem data', state: 'closed' },
      ],
    },
  },
  '50': {
    status: 200,
    body: {
      isLast: true,
      values: [
        {
          id: 32,
          name: 'LAB Sprint 2',
          state: 'active',
          startDate: '2026-11-02T12:00:00.000Z',
          endDate: '2026-11-16T12:00:00.000Z',
        },
      ],
    },
  },
}

const route: Route = (call) => {
  if (call.path === '/rest/agile/1.0/board/7/sprint') return SPRINTS[call.query.startAt ?? '']
  if (call.path === SEARCH_PATH && call.method === 'POST' && !call.body?.nextPageToken) {
    return {
      status: 200,
      body: {
        nextPageToken: 'page-2',
        issues: [
          cloudIssue(
            'LAB-1',
            {
              status: { name: 'Concluído' },
              resolutiondate: '2026-11-10T15:00:00.000-0300',
              parent: { key: 'LAB-9', fields: { issuetype: { name: 'Epic' } } },
              customfield_10020: [{ id: 31 }, { id: 32 }, { id: 77 }],
            },
            { total: 3, histories: [] },
          ),
        ],
      },
    }
  }
  if (call.path === SEARCH_PATH && call.body?.nextPageToken === 'page-2') {
    return {
      status: 200,
      body: {
        isLast: true,
        issues: [
          cloudIssue(
            'LAB-2',
            {
              components: [],
              parent: { key: 'LAB-1', fields: { issuetype: { name: 'Story' } } },
              customfield_10020: [{ id: 32 }],
              summary: '',
            },
            {
              total: 1,
              histories: [
                history('2026-11-03T10:00:00.000Z', [statusItem('A fazer', 'Em andamento')]),
              ],
            },
          ),
        ],
      },
    }
  }
  if (call.path === '/rest/api/3/issue/LAB-1/changelog') {
    const pages: Record<string, Reply> = {
      '0': {
        status: 200,
        body: {
          isLast: false,
          total: 3,
          values: [
            history('2026-11-03T09:00:00.000-0300', [
              statusItem('A fazer', 'Em andamento'),
              { field: 'Sprint', from: '', to: '31' },
            ]),
            history('2026-11-04T09:00:00.000-0300', [
              { field: 'Sprint', from: '31', to: '31, 32' },
              { field: 'assignee', fromString: null, toString: 'Outra Pessoa' },
            ]),
          ],
        },
      },
      '100': {
        status: 200,
        body: {
          isLast: true,
          values: [
            history('2026-11-10T15:00:00.000-0300', [statusItem('Em andamento', 'Concluído')]),
          ],
        },
      },
    }
    return pages[call.query.startAt ?? '']
  }
  return undefined
}

const source = (fetch: typeof globalThis.fetch) =>
  createCloudJiraSource({
    http: createJiraHttp({
      site: `${SITE}/`,
      email: 'bot@example.test',
      apiToken: 'fake-token',
      fetch,
      sleep: () => Promise.resolve(),
    }),
    site: SITE,
    projects: ['LAB'],
    boards: [{ project: 'LAB', boardId: 7 }],
    sprintField: 'customfield_10020',
    lookbackDays: 90,
  })

describe('Jira Cloud adapter', () => {
  it('pages through search, changelog and sprints and maps everything to the mirror', async () => {
    const jira = fakeJira(route)
    const batch = await source(jira.fetch).fetch(new Date('2026-11-20T12:00:00.000Z'))

    expect(batch.sprints).toEqual([
      {
        id: 31,
        project: 'LAB',
        name: 'LAB Sprint 1',
        state: 'closed',
        startsAt: '2026-10-19T12:00:00.000Z',
        endsAt: '2026-11-02T12:00:00.000Z',
        completedAt: '2026-11-02T10:00:00.000Z',
      },
      {
        id: 32,
        project: 'LAB',
        name: 'LAB Sprint 2',
        state: 'active',
        startsAt: '2026-11-02T12:00:00.000Z',
        endsAt: '2026-11-16T12:00:00.000Z',
        completedAt: null,
      },
    ])
    expect(batch.issues).toEqual([
      {
        key: 'LAB-1',
        project: 'LAB',
        component: 'Portal',
        issueType: 'Story',
        status: 'Concluído',
        summary: 'Resumo LAB-1',
        url: `${SITE}/browse/LAB-1`,
        epicKey: 'LAB-9',
        sprintId: 32,
        assignee: 'Pessoa Fictícia',
        createdAt: '2026-11-02T12:00:00.000Z',
        resolvedAt: '2026-11-10T18:00:00.000Z',
      },
      expect.objectContaining({
        key: 'LAB-2',
        component: null,
        summary: null,
        epicKey: null,
        sprintId: 32,
      }),
    ])
    expect(batch.changes).toEqual([
      {
        issueKey: 'LAB-1',
        fromStatus: 'A fazer',
        toStatus: 'Em andamento',
        changedAt: '2026-11-03T12:00:00.000Z',
      },
      {
        issueKey: 'LAB-1',
        fromStatus: 'Em andamento',
        toStatus: 'Concluído',
        changedAt: '2026-11-10T18:00:00.000Z',
      },
      {
        issueKey: 'LAB-2',
        fromStatus: 'A fazer',
        toStatus: 'Em andamento',
        changedAt: '2026-11-03T10:00:00.000Z',
      },
    ])
    expect(batch.sprintIssues).toEqual([
      { sprintId: 31, issueKey: 'LAB-1', addedAt: '2026-11-03T12:00:00.000Z' },
      { sprintId: 32, issueKey: 'LAB-1', addedAt: '2026-11-04T12:00:00.000Z' },
      { sprintId: 32, issueKey: 'LAB-2', addedAt: '2026-11-02T12:00:00.000Z' },
    ])

    const searches = jira.calls.filter((call) => call.path === SEARCH_PATH)
    expect(searches).toHaveLength(2)
    expect(searches[0]?.body).toMatchObject({
      jql: buildJql(['LAB'], 90),
      expand: 'changelog',
      maxResults: 100,
      fields: expect.arrayContaining(['status', 'customfield_10020']),
    })
    expect(searches[1]?.body).toMatchObject({ nextPageToken: 'page-2' })
    expect(jira.calls.flatMap((call) => call.query.startAt ?? [])).toEqual(['0', '50', '0', '100'])
    expect(jira.calls[0]?.headers.Authorization).toBe(
      `Basic ${Buffer.from('bot@example.test:fake-token').toString('base64')}`,
    )
  })

  it('only reads: every request is a GET or the JQL search', async () => {
    const jira = fakeJira(route)
    await source(jira.fetch).fetch(new Date())
    for (const call of jira.calls) {
      expect(
        call.method === 'GET' || (call.method === 'POST' && call.path === SEARCH_PATH),
        `${call.method} ${call.path}`,
      ).toBe(true)
    }
  })

  it('builds a JQL without subtasks that keeps every epic', () => {
    expect(buildJql(['LAB', 'OPS'], 120)).toBe(
      'project in (LAB, OPS) AND (updated >= -120d OR issuetype = Epic) ' +
        'AND issuetype not in subTaskIssueTypes() ORDER BY key ASC',
    )
  })
})

describe('Jira HTTP client', () => {
  const schema = z.unknown()

  it('waits the Retry-After seconds on 429 and then succeeds', async () => {
    let attempts = 0
    const waits: number[] = []
    const jira = fakeJira(() => {
      attempts += 1
      return attempts < 3
        ? { status: 429, headers: { 'Retry-After': '2' } }
        : { status: 200, body: { ok: true } }
    })
    const http = createJiraHttp({
      site: SITE,
      email: 'bot@example.test',
      apiToken: 'fake-token',
      fetch: jira.fetch,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })
    expect(await http.get('/rest/api/3/myself', {}, schema)).toEqual({ ok: true })
    expect(waits).toEqual([2000, 2000])
  })

  it('gives up after the retry budget and reports the status', async () => {
    const waits: number[] = []
    const jira = fakeJira(() => ({ status: 429 }))
    const http = createJiraHttp({
      site: SITE,
      email: 'bot@example.test',
      apiToken: 'fake-token',
      fetch: jira.fetch,
      maxRetries: 2,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })
    await expect(http.search({ jql: 'project = LAB' }, schema)).rejects.toThrow(
      `Jira answered 429 on POST ${SEARCH_PATH}`,
    )
    expect(waits).toEqual([1000, 2000])
    expect(jira.calls).toHaveLength(3)
  })

  it('does not retry client errors', async () => {
    const jira = fakeJira(() => ({ status: 401 }))
    const http = createJiraHttp({
      site: SITE,
      email: 'bot@example.test',
      apiToken: 'wrong',
      fetch: jira.fetch,
    })
    await expect(http.get('/rest/api/3/myself', {}, schema)).rejects.toThrow('Jira answered 401')
    expect(jira.calls).toHaveLength(1)
  })

  it('reads Retry-After as seconds or HTTP date and caps the wait', () => {
    const now = Date.parse('2026-11-20T12:00:00.000Z')
    expect(retryDelayMs('5', 0, now)).toBe(5000)
    expect(retryDelayMs('Fri, 20 Nov 2026 12:00:10 GMT', 0, now)).toBe(10_000)
    expect(retryDelayMs('Fri, 20 Nov 2026 11:00:00 GMT', 0, now)).toBe(0)
    expect(retryDelayMs('3600', 0, now)).toBe(60_000)
    expect(retryDelayMs(null, 2, now)).toBe(4000)
    expect(retryDelayMs('soon', 1, now)).toBe(2000)
  })

  it('normalizes Jira offsets and rejects garbage dates', () => {
    expect(toIsoInstant('2026-11-10T15:00:00.000-0300')).toBe('2026-11-10T18:00:00.000Z')
    expect(toIsoInstant('2026-11-10T15:00:00.000+05:30')).toBe('2026-11-10T09:30:00.000Z')
    expect(() => toIsoInstant('ontem')).toThrow('Invalid Jira date: ontem')
  })
})
