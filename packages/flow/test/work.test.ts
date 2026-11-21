import { describe, expect, it } from 'vitest'
import {
  blockedByAccount,
  businessDaysBetween,
  myTasks,
  openWork,
  parseWorkflow,
  sameAccount,
  type WorkDataset,
  type WorkIssue,
  workLoad,
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
const at = (iso: string) => Date.parse(iso)

const issue = (key: string, overrides: Partial<WorkIssue> = {}): WorkIssue => ({
  key,
  project: 'LAB',
  component: null,
  issueType: 'Story',
  status: 'Em andamento',
  summary: `Item ${key}`,
  url: null,
  epicKey: null,
  assignee: 'ana',
  createdAt: '2026-11-19T12:00:00.000Z',
  resolvedAt: null,
  ...overrides,
})

const dataset = (issues: WorkIssue[], extra: Partial<WorkDataset> = {}): WorkDataset => ({
  issues,
  changes: [],
  links: [],
  ...extra,
})

const work = (data: WorkDataset, staleAfterBusinessDays = 3) =>
  openWork({ dataset: data, workflow, now: NOW, staleAfterBusinessDays })

describe('business days', () => {
  it('counts only Monday to Friday, with fractions', () => {
    expect(businessDaysBetween(at('2026-11-13T12:00:00Z'), at('2026-11-20T12:00:00Z'))).toBe(5)
    expect(businessDaysBetween(at('2026-11-14T00:00:00Z'), at('2026-11-16T00:00:00Z'))).toBe(0)
    expect(businessDaysBetween(at('2026-11-13T18:00:00Z'), at('2026-11-16T06:00:00Z'))).toBe(0.5)
    expect(businessDaysBetween(at('2026-11-20T12:00:00Z'), at('2026-11-20T12:00:00Z'))).toBe(0)
    expect(businessDaysBetween(at('2026-11-20T12:00:00Z'), at('2026-11-19T12:00:00Z'))).toBe(0)
    expect(businessDaysBetween(at('2026-10-01T00:00:00Z'), at('2026-11-02T00:00:00Z'))).toBe(22)
  })
})

describe('accounts', () => {
  it('match without case or spaces and never on a missing account', () => {
    expect(sameAccount(' Ana ', 'ana')).toBe(true)
    expect(sameAccount('ana', 'bruno')).toBe(false)
    expect(sameAccount(null, 'ana')).toBe(false)
    expect(sameAccount(null, null)).toBe(false)
  })
})

describe('open work', () => {
  it('keeps only open items, without epics, oldest move first', () => {
    const items = work(
      dataset(
        [
          issue('LAB-1'),
          issue('LAB-2', { status: 'A fazer' }),
          issue('LAB-3', { status: 'Concluído' }),
          issue('LAB-4', { issueType: 'Epic' }),
          issue('LAB-5', { status: 'Triagem' }),
          issue('LAB-6', { status: 'Code Review', createdAt: '2026-11-02T12:00:00.000Z' }),
        ],
        {
          changes: [
            {
              issueKey: 'LAB-6',
              fromStatus: 'A fazer',
              toStatus: 'Code Review',
              changedAt: '2026-11-16T12:00:00.000Z',
            },
            {
              issueKey: 'LAB-6',
              fromStatus: 'Em andamento',
              toStatus: 'Code Review',
              changedAt: '2026-11-10T12:00:00.000Z',
            },
          ],
        },
      ),
    )
    expect(items.map((item) => [item.key, item.category, item.since])).toEqual([
      ['LAB-6', 'review', '2026-11-16T12:00:00.000Z'],
      ['LAB-1', 'in_progress', '2026-11-19T12:00:00.000Z'],
    ])
  })

  it('is stale only after more than N business days without a status change', () => {
    const items = work(
      dataset([
        issue('LAB-1', { createdAt: '2026-11-17T12:00:00.000Z' }),
        issue('LAB-2', { createdAt: '2026-11-16T12:00:00.000Z' }),
        issue('LAB-3', { createdAt: '2026-11-21T12:00:00.000Z' }),
      ]),
    )
    expect(items.map((item) => [item.key, item.idleBusinessDays, item.stale])).toEqual([
      ['LAB-2', 4, true],
      ['LAB-1', 3, false],
      ['LAB-3', 0, false],
    ])
    expect(items.at(-1)?.since).toBe(NOW.toISOString())
  })

  it('splits one person items by situation and counts the load', () => {
    const items = work(
      dataset([
        issue('LAB-1', { createdAt: '2026-11-02T12:00:00.000Z' }),
        issue('LAB-2', { status: 'Code Review' }),
        issue('LAB-3', { status: 'Bloqueado', createdAt: '2026-11-02T12:00:00.000Z' }),
        issue('LAB-4', { assignee: 'bruno' }),
        issue('LAB-5', { assignee: null }),
      ]),
    )
    const tasks = myTasks(items, 'ANA')
    expect(tasks.inProgress.map((item) => item.key)).toEqual(['LAB-1'])
    expect(tasks.review.map((item) => item.key)).toEqual(['LAB-2'])
    expect(tasks.blocked.map((item) => item.key)).toEqual(['LAB-3'])
    expect(tasks.stale.map((item) => item.key)).toEqual(['LAB-1', 'LAB-3'])
    expect(workLoad(items, 'ana')).toEqual({ inProgress: 1, review: 1, blocked: 1, stale: 2 })
    expect(workLoad(items, 'carla')).toEqual({ inProgress: 0, review: 0, blocked: 0, stale: 0 })
  })
})

describe('blocked by an account', () => {
  it('lists other people items waiting on my unfinished items', () => {
    const data = dataset(
      [
        issue('LAB-1'),
        issue('LAB-2', { status: 'Concluído' }),
        issue('LAB-3', { assignee: 'bruno', status: 'Bloqueado' }),
        issue('LAB-4', { assignee: 'carla' }),
        issue('LAB-5', { assignee: 'bruno', status: 'Concluído' }),
        issue('LAB-6', { assignee: 'ana' }),
        issue('LAB-7', { assignee: 'bruno' }),
      ],
      {
        links: [
          { blockedKey: 'LAB-4', blockerKey: 'LAB-1' },
          { blockedKey: 'LAB-3', blockerKey: 'LAB-1' },
          { blockedKey: 'LAB-3', blockerKey: 'LAB-2' },
          { blockedKey: 'LAB-5', blockerKey: 'LAB-1' },
          { blockedKey: 'LAB-6', blockerKey: 'LAB-1' },
          { blockedKey: 'LAB-9', blockerKey: 'LAB-1' },
          { blockedKey: 'LAB-1', blockerKey: 'LAB-7' },
        ],
      },
    )
    expect(
      blockedByAccount(data, workflow, 'ana').map((item) => [
        item.key,
        item.category,
        item.assignee,
        item.blocker.key,
      ]),
    ).toEqual([
      ['LAB-3', 'blocked', 'bruno', 'LAB-1'],
      ['LAB-4', 'in_progress', 'carla', 'LAB-1'],
    ])
    expect(blockedByAccount(data, workflow, 'bruno').map((item) => item.key)).toEqual(['LAB-1'])
  })
})
