import { describe, expect, it } from 'vitest'
import {
  boardSummaries,
  buildBoard,
  CFD_DAYS,
  type FlowDataset,
  type FlowIssue,
  type FlowSprint,
  parseWorkflow,
  recentSprints,
} from '../src/index.js'

const workflow = parseWorkflow(`
categories:
  - { id: todo, label: A fazer, statuses: [A fazer] }
  - { id: in_progress, label: Em andamento, statuses: [Em andamento] }
  - { id: review, label: Em review, statuses: [Code Review] }
  - { id: blocked, label: Bloqueado, statuses: [Bloqueado] }
  - { id: done, label: Concluído, statuses: [Concluído] }
`)

const NOW = new Date('2026-11-20T12:00:00.000Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000).toISOString()

const issue = (key: string, overrides: Partial<FlowIssue> = {}): FlowIssue => ({
  key,
  project: key.split('-')[0] ?? 'LAB',
  component: 'Portal',
  issueType: 'Story',
  status: 'A fazer',
  summary: `Item ${key}`,
  url: `https://jira.example.test/browse/${key}`,
  epicKey: 'LAB-100',
  createdAt: day(-40),
  resolvedAt: null,
  ...overrides,
})

const sprint = (id: number, state: FlowSprint['state'], start: number): FlowSprint => ({
  id,
  project: 'LAB',
  name: `LAB Sprint ${id}`,
  state,
  startsAt: day(start),
  endsAt: day(start + 14),
  completedAt: state === 'closed' ? day(start + 14) : null,
})

const dataset: FlowDataset = {
  issues: [
    issue('LAB-100', { issueType: 'Epic', epicKey: null, status: 'Em andamento' }),
    issue('LAB-101', {
      issueType: 'Epic',
      epicKey: null,
      status: 'Concluído',
      resolvedAt: day(-1),
    }),
    issue('LAB-1', { status: 'Concluído', resolvedAt: day(-3) }),
    issue('LAB-2', { status: 'Concluído', resolvedAt: day(-20) }),
    issue('LAB-3', { status: 'Em andamento' }),
    issue('LAB-4', { status: 'Bloqueado', epicKey: null }),
    issue('LAB-5', { createdAt: day(-2) }),
    issue('OPS-1', { status: 'Em andamento', epicKey: null }),
  ],
  changes: [
    { issueKey: 'LAB-1', fromStatus: 'A fazer', toStatus: 'Em andamento', changedAt: day(-6) },
    { issueKey: 'LAB-1', fromStatus: 'Em andamento', toStatus: 'Concluído', changedAt: day(-3) },
    { issueKey: 'LAB-2', fromStatus: 'A fazer', toStatus: 'Em andamento', changedAt: day(-25) },
    { issueKey: 'LAB-2', fromStatus: 'Em andamento', toStatus: 'Concluído', changedAt: day(-20) },
    { issueKey: 'LAB-3', fromStatus: 'A fazer', toStatus: 'Em andamento', changedAt: day(-4) },
    { issueKey: 'LAB-4', fromStatus: 'A fazer', toStatus: 'Em andamento', changedAt: day(-10) },
    { issueKey: 'LAB-4', fromStatus: 'Em andamento', toStatus: 'Bloqueado', changedAt: day(-5) },
  ],
  sprints: [
    sprint(1, 'closed', -70),
    sprint(2, 'closed', -56),
    sprint(3, 'closed', -42),
    sprint(4, 'closed', -28),
    sprint(5, 'active', -7),
    sprint(6, 'future', 7),
    { ...sprint(7, 'future', 21), startsAt: null },
  ],
  sprintIssues: [
    { sprintId: 4, issueKey: 'LAB-2', addedAt: day(-29) },
    { sprintId: 4, issueKey: 'LAB-4', addedAt: day(-20) },
    { sprintId: 5, issueKey: 'LAB-1', addedAt: day(-8) },
    { sprintId: 5, issueKey: 'LAB-3', addedAt: null },
    { sprintId: 5, issueKey: 'LAB-4', addedAt: day(-8) },
    { sprintId: 5, issueKey: 'LAB-5', addedAt: day(-2) },
    { sprintId: 5, issueKey: 'LAB-100', addedAt: day(-8) },
  ],
}

const board = () => buildBoard({ project: 'LAB', dataset, workflow, now: NOW })

describe('board', () => {
  it('lays the kanban out in workflow order with recent deliveries only', () => {
    const result = board()
    expect(result.columns.map((column) => [column.label, column.items.map((i) => i.key)])).toEqual([
      ['A fazer', ['LAB-5']],
      ['Em andamento', ['LAB-3']],
      ['Em review', []],
      ['Bloqueado', ['LAB-4']],
      ['Concluído', ['LAB-1']],
    ])
    expect(result.doneWindowDays).toBe(14)
    expect(result.columns[3]?.items[0]).toMatchObject({
      enteredAt: day(-5),
      daysInColumn: 5,
      epicKey: null,
      url: 'https://jira.example.test/browse/LAB-4',
    })
  })

  it('accumulates eight weeks of daily points with done growing over time', () => {
    const { cfd } = board()
    expect(cfd).toHaveLength(CFD_DAYS)
    expect(cfd.at(-1)).toEqual({
      day: '2026-11-20',
      todo: 1,
      in_progress: 1,
      review: 0,
      blocked: 1,
      done: 2,
    })
    expect(cfd[0]?.day).toBe('2026-09-26')
    expect(cfd[0]).toMatchObject({ todo: 0, done: 0 })
    expect(cfd[25]).toMatchObject({ day: '2026-10-21', todo: 4, in_progress: 0, done: 0 })
    const done = cfd.map((point) => point.done)
    expect(done).toEqual(done.toSorted((a, b) => a - b))
  })

  it('compares planned and delivered for the active sprint and the three before it', () => {
    const { sprints } = board()
    expect(sprints.map((s) => s.id)).toEqual([2, 3, 4, 5])
    expect(sprints.at(-1)).toMatchObject({
      name: 'LAB Sprint 5',
      state: 'active',
      planned: 3,
      added: 1,
      delivered: 1,
      deliveredPlanned: 1,
    })
    expect(sprints.at(-2)).toMatchObject({
      planned: 1,
      added: 1,
      delivered: 1,
      deliveredPlanned: 1,
    })
  })

  it('keeps the last four closed sprints when none is active', () => {
    const closed = dataset.sprints.filter((s) => s.state !== 'active')
    expect(recentSprints(closed).map((s) => s.id)).toEqual([1, 2, 3, 4])
  })

  it('shows epic progress with open epics first and no percent for an empty epic', () => {
    expect(board().epics).toEqual([
      expect.objectContaining({ key: 'LAB-100', total: 4, done: 2, percent: 50 }),
      expect.objectContaining({ key: 'LAB-101', total: 0, done: 0, percent: null }),
    ])
  })

  it('summarizes every project for the picker', () => {
    expect(boardSummaries(dataset, workflow)).toEqual([
      { project: 'LAB', items: 5, inProgress: 2, activeSprint: 'LAB Sprint 5' },
      { project: 'OPS', items: 1, inProgress: 1, activeSprint: null },
    ])
  })
})
