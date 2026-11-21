import type { Alert, QueueRow } from '@lab/eng-metrics/contract'

export const row = (overrides: Partial<QueueRow> = {}): QueueRow => ({
  position: 1,
  number: 10,
  title: 'feat: LAB-10 filtro de campanhas',
  url: 'https://example.invalid/pr/10',
  author: 'ana',
  taskKey: 'LAB-10',
  taskStatus: 'Code Review',
  requestedReviewers: ['bruno'],
  enteredAt: '2026-11-18T12:00:00.000Z',
  enteredFrom: 'jira',
  ageBusinessDays: 0.5,
  level: 'ok',
  hasHumanReview: false,
  checks: 'SUCCESS',
  botSignal: 'pronto',
  risks: [],
  lines: 120,
  ...overrides,
})

export const alert = (overrides: Partial<Alert> = {}): Alert => ({
  kind: 'PR grande',
  severity: 'media',
  subject: '#10',
  message: 'PR #10 altera 900 linhas.',
  url: 'https://example.invalid/pr/10',
  ...overrides,
})
