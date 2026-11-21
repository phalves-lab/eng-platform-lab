import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWorkflow } from '@lab/flow'
import { describe, expect, it, vi } from 'vitest'
import { consistentBatch, createJiraCollector } from '../src/collectors/jira/collector.js'
import { createFixtureJiraSource } from '../src/collectors/jira/fixture-source.js'
import { createJiraSource } from '../src/collectors/jira/index.js'
import type { JiraBatch } from '../src/collectors/jira/source.js'
import { createLogger } from '../src/logger.js'

const BOARDS = fileURLToPath(new URL('../../../fixtures/jira-board', import.meta.url))
const WORKFLOW = fileURLToPath(new URL('../../../catalog/jira/workflow.yaml', import.meta.url))
const ANCHOR = new Date('2026-11-20T12:00:00.000Z')

const fixture = () => createFixtureJiraSource({ dir: BOARDS, rebase: false })

describe('Jira fixture adapter', () => {
  it('serves two synthetic projects with sprints, epics, blocks and aging items', async () => {
    const batch = await fixture().fetch(ANCHOR)
    const projects = new Set(batch.issues.map((issue) => issue.project))
    expect([...projects]).toEqual(['LAB', 'OPS'])
    expect(batch.issues.length).toBeGreaterThanOrEqual(60)
    for (const project of projects) {
      const components = new Set(
        batch.issues.filter((i) => i.project === project && i.component).map((i) => i.component),
      )
      expect(components.size).toBe(2)
      expect(
        batch.sprints.filter((s) => s.project === project && s.state === 'active'),
      ).toHaveLength(1)
    }
    expect(batch.issues.some((issue) => issue.issueType === 'Epic')).toBe(true)
    expect(batch.issues.filter((i) => ['Bloqueado', 'Impedido'].includes(i.status))).toHaveLength(4)
    expect(batch.issues.every((issue) => issue.url?.startsWith('https://jira.example.test/'))).toBe(
      true,
    )
    const workflow = await loadWorkflow(WORKFLOW)
    const unknown = batch.issues.filter((i) => workflow.classify(i.project, i.status) === null)
    expect(unknown).toEqual([])
  })

  it('chains the history into transitions and keeps the last status', async () => {
    const batch = await fixture().fetch(ANCHOR)
    const done = batch.issues.find(
      (issue) => issue.resolvedAt !== null && issue.issueType !== 'Epic',
    )
    expect(done).toBeDefined()
    const changes = batch.changes.filter((change) => change.issueKey === done?.key)
    expect(changes[0]?.fromStatus).toBe('A fazer')
    for (let index = 1; index < changes.length; index += 1) {
      expect(changes[index]?.fromStatus).toBe(changes[index - 1]?.toStatus)
    }
    expect(changes.at(-1)?.toStatus).toBe(done?.status)
  })

  it('moves every date by whole weeks so the board stays current', async () => {
    const original = await fixture().fetch(ANCHOR)
    const later = new Date(ANCHOR.getTime() + 15 * 24 * 60 * 60 * 1000)
    const rebased = await createFixtureJiraSource({ dir: BOARDS, rebase: true }).fetch(later)
    const twoWeeks = 14 * 24 * 60 * 60 * 1000
    const first = original.issues[0]
    const moved = rebased.issues[0]
    expect(Date.parse(moved?.createdAt ?? '') - Date.parse(first?.createdAt ?? '')).toBe(twoWeeks)
    expect(rebased.sprints[0]?.startsAt).not.toBe(original.sprints[0]?.startsAt)
    const unchanged = await createFixtureJiraSource({ dir: BOARDS, rebase: true }).fetch(ANCHOR)
    expect(unchanged.issues[0]?.createdAt).toBe(first?.createdAt)
  })

  it('fails clearly on an empty folder or an invalid file', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'jira-board-'))
    await expect(
      createFixtureJiraSource({ dir: empty, rebase: false }).fetch(ANCHOR),
    ).rejects.toThrow('No Jira fixtures')
    await writeFile(join(empty, 'X.json'), JSON.stringify({ project: 'x' }))
    await expect(
      createFixtureJiraSource({ dir: empty, rebase: false }).fetch(ANCHOR),
    ).rejects.toThrow('Invalid Jira fixture')
  })

  it('is the adapter picked for the fixture configuration', () => {
    expect(
      createJiraSource({ workflowPath: WORKFLOW, source: { kind: 'fixture', dir: BOARDS } }).kind,
    ).toBe('fixture')
    const cloud = createJiraSource({
      workflowPath: WORKFLOW,
      source: {
        kind: 'cloud',
        credentials: { site: 'https://jira.example.test', email: 'a@example.test', apiToken: 'x' },
        projects: ['LAB'],
        boards: [],
        sprintField: 'customfield_10020',
        lookbackDays: 30,
      },
    })
    expect(cloud.kind).toBe('cloud')
  })
})

const emptyBatch = (): JiraBatch => ({ sprints: [], issues: [], changes: [], sprintIssues: [] })

describe('Jira collector', () => {
  it('drops links that point outside the batch', () => {
    const batch = consistentBatch({
      sprints: [
        {
          id: 1,
          project: 'LAB',
          name: 'S1',
          state: 'active',
          startsAt: null,
          endsAt: null,
          completedAt: null,
        },
      ],
      issues: [
        {
          key: 'LAB-1',
          project: 'LAB',
          component: null,
          issueType: 'Story',
          status: 'A fazer',
          summary: null,
          url: null,
          epicKey: null,
          sprintId: 9,
          assignee: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: null,
        },
      ],
      changes: [
        {
          issueKey: 'LAB-1',
          fromStatus: null,
          toStatus: 'A fazer',
          changedAt: '2026-11-01T00:00:00.000Z',
        },
        {
          issueKey: 'LAB-2',
          fromStatus: null,
          toStatus: 'A fazer',
          changedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      sprintIssues: [
        { sprintId: 1, issueKey: 'LAB-1', addedAt: null },
        { sprintId: 9, issueKey: 'LAB-1', addedAt: null },
        { sprintId: 1, issueKey: 'LAB-2', addedAt: null },
      ],
    })
    expect(batch.issues[0]?.sprintId).toBeNull()
    expect(batch.changes.map((change) => change.issueKey)).toEqual(['LAB-1'])
    expect(batch.sprintIssues).toEqual([{ sprintId: 1, issueKey: 'LAB-1', addedAt: null }])
  })

  it('upserts sprints before issues and warns about statuses missing from the workflow', async () => {
    const order: string[] = []
    const repository = {
      upsertSprints: vi.fn(() => {
        order.push('sprints')
        return Promise.resolve()
      }),
      upsertIssues: vi.fn(() => {
        order.push('issues')
        return Promise.resolve()
      }),
      addStatusChanges: vi.fn(() => {
        order.push('changes')
        return Promise.resolve(3)
      }),
      upsertSprintIssues: vi.fn(() => {
        order.push('sprintIssues')
        return Promise.resolve()
      }),
    }
    const batch = emptyBatch()
    batch.issues.push({
      key: 'LAB-5',
      project: 'LAB',
      component: null,
      issueType: 'Story',
      status: 'Triagem',
      summary: null,
      url: null,
      epicKey: null,
      sprintId: null,
      assignee: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: null,
    })
    batch.changes.push({
      issueKey: 'LAB-5',
      fromStatus: 'A fazer',
      toStatus: 'Triagem',
      changedAt: '2026-11-02T00:00:00.000Z',
    })
    const lines: string[] = []
    const collector = createJiraCollector({
      source: { kind: 'fixture', fetch: () => Promise.resolve(batch) },
      repository,
      workflow: await loadWorkflow(WORKFLOW),
      intervalMs: 60_000,
    })
    expect(collector.name).toBe('jira')
    await collector.run({ now: ANCHOR, logger: createLogger((line) => lines.push(line)) })

    expect(order).toEqual(['sprints', 'issues', 'changes', 'sprintIssues'])
    const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(logs[0]).toMatchObject({
      level: 'warn',
      msg: 'jira.unmapped_statuses',
      statuses: [{ project: 'LAB', status: 'Triagem' }],
    })
    expect(logs[1]).toMatchObject({
      msg: 'jira.synced',
      source: 'fixture',
      issues: 1,
      newChanges: 3,
    })
  })
})
