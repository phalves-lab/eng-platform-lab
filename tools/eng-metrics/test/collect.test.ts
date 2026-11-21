import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { collectPanelData, type LabSource } from '../src/collect.js'

const NOW = '2026-11-20T12:00:00.000Z'
const FIXTURES = fileURLToPath(new URL('../../../fixtures/jira', import.meta.url))

const pullRequest = {
  number: 21,
  title: 'feat: LAB-18 portal',
  url: 'https://example.invalid/pr/21',
  state: 'OPEN',
  isDraft: false,
  createdAt: '2026-11-19T10:00:00Z',
  mergedAt: null,
  updatedAt: '2026-11-20T10:00:00Z',
  additions: 10,
  deletions: 2,
  headRefName: 'feat/LAB-18-portal',
  baseRefName: 'develop',
  author: { login: 'ana' },
  labels: { nodes: [] },
  reviewRequests: { nodes: [{ requestedReviewer: { login: 'bruno' } }] },
  reviews: { nodes: [] },
  comments: { nodes: [] },
  timelineItems: { nodes: [] },
  commits: { nodes: [] },
}

const fakeFetch = () =>
  vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('graphql')) {
      return Response.json({
        data: {
          repository: {
            pullRequests: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [pullRequest],
            },
          },
        },
      })
    }
    return Response.json({
      key: 'LAB-18',
      fields: { summary: 'Portal', status: { name: 'Code Review' } },
    })
  }) as unknown as typeof fetch

const lab = (overrides: Partial<LabSource> = {}): LabSource => ({
  token: 'token',
  repository: 'phalves-lab/eng-platform-lab',
  taskSource: 'fixtures',
  fixturesDir: FIXTURES,
  ...overrides,
})

describe('collectPanelData', () => {
  it('builds only the demo dataset when the lab is off', async () => {
    const data = await collectPanelData({ lab: null, demo: true }, NOW)
    expect(data.datasets.map((d) => d.id)).toEqual(['demo'])
    expect(data.generatedAt).toBe(NOW)
  })

  it('collects the lab from GitHub with fixture tasks', async () => {
    const fetchImpl = fakeFetch()
    const data = await collectPanelData({ lab: lab(), demo: false, fetchImpl }, NOW)
    const [dataset] = data.datasets
    expect(dataset?.label).toBe('Laboratório (phalves-lab/eng-platform-lab)')
    expect(dataset?.queue[0]).toMatchObject({ number: 21, taskStatus: 'Code Review' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reads Jira only for the task keys found in the PRs', async () => {
    const fetchImpl = fakeFetch()
    const data = await collectPanelData(
      {
        lab: lab({ taskSource: 'jira', jira: { site: 'x.invalid', email: 'e', apiToken: 't' } }),
        demo: true,
        fetchImpl,
      },
      NOW,
    )
    expect(data.datasets.map((d) => d.id)).toEqual(['lab', 'demo'])
    expect(String(vi.mocked(fetchImpl).mock.calls[1]?.[0])).toContain('/issue/LAB-18')
  })

  it('refuses missing credentials and real Jira in CI', async () => {
    await expect(collectPanelData({ lab: lab({ token: '' }), demo: false }, NOW)).rejects.toThrow(
      'Defina GITHUB_TOKEN',
    )
    await expect(
      collectPanelData(
        { lab: lab({ taskSource: 'jira', ci: true }), demo: false, fetchImpl: fakeFetch() },
        NOW,
      ),
    ).rejects.toThrow('só roda localmente')
  })
})
