import type { ReleaseRun, ReleaseTrackedPull, ReleaseWriteStep } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  approvalsText,
  canPublish,
  canWriteReleases,
  confirmationMatches,
  describeStep,
  errorMessage,
  runSummary,
  sidesText,
} from '../src/lib/release-write'

const SHA = '0123456789abcdef0123456789abcdef01234567'

const tracked = (overrides: Partial<ReleaseTrackedPull> = {}): ReleaseTrackedPull => ({
  lastRunId: 1,
  lastRunAt: '2026-11-21T12:00:00Z',
  lastRunBy: 'lider.lab',
  sides: ['back'],
  repo: 'acme/api',
  number: 9,
  url: 'https://gh/9',
  title: 'chore(release): release',
  state: 'merged',
  mergeable: null,
  mergedAt: '2026-11-21T13:00:00Z',
  mergeSha: SHA,
  summary: { state: 'success', url: null },
  checks: { state: 'success', total: 1, failed: [], pending: 0 },
  approvals: { approved: [], changesRequested: [] },
  published: null,
  ...overrides,
})

const run = (result: Partial<ReleaseRun['result']>): ReleaseRun => ({
  id: 1,
  projectId: 'demo',
  action: 'release',
  actor: 'lider.lab',
  role: 'lead',
  planHash: 'a'.repeat(64),
  createdAt: '2026-11-21T12:00:00Z',
  result: {
    status: 'success',
    pulls: [],
    branches: [],
    release: null,
    completed: 0,
    total: 0,
    error: null,
    ...result,
  },
})

describe('release write helpers', () => {
  it('lets only lead and admin write', () => {
    expect(canWriteReleases('lead')).toBe(true)
    expect(canWriteReleases('admin')).toBe(true)
    expect(canWriteReleases('dev')).toBe(false)
    expect(canWriteReleases(null)).toBe(false)
  })

  it('unlocks the execution only when every repository is typed exactly', () => {
    expect(confirmationMatches(['acme/api', ' acme/web '], ['acme/web', 'acme/api'])).toBe(true)
    expect(confirmationMatches(['acme/api'], ['acme/web', 'acme/api'])).toBe(false)
    expect(confirmationMatches(['acme/Api'], ['acme/api'])).toBe(false)
    expect(confirmationMatches([], [])).toBe(false)
  })

  it('describes every write step in plain words', () => {
    const steps: ReleaseWriteStep[] = [
      { kind: 'create-branch', repo: 'acme/api', branch: 'release/x', from: 'develop', sha: SHA },
      { kind: 'reuse-branch', repo: 'acme/api', branch: 'release/x', sha: SHA },
      {
        kind: 'create-pull',
        repo: 'acme/api',
        head: 'develop',
        base: 'main',
        title: 't',
        body: 'b',
      },
      { kind: 'update-pull', repo: 'acme/api', number: 4, url: 'u', body: 'b' },
      { kind: 'add-labels', repo: 'acme/api', labels: ['release', 'pre-release-notes'] },
      { kind: 'add-assignees', repo: 'acme/api', logins: ['ana'] },
      { kind: 'link-pulls', repos: ['acme/web', 'acme/api'] },
      { kind: 'create-tag', repo: 'acme/api', tag: 'v1', sha: SHA },
      { kind: 'create-release', repo: 'acme/api', tag: 'v1', name: 'Release v1', body: 'b' },
    ]
    expect(steps.map(describeStep)).toEqual([
      'Criar a branch release/x em acme/api a partir de develop (0123456)',
      'Usar a branch release/x, que já aponta para 0123456 em acme/api',
      'Abrir a PR develop → main em acme/api',
      'Atualizar o corpo da PR #4 em acme/api',
      'Aplicar os rótulos release, pre-release-notes em acme/api',
      'Atribuir ana em acme/api',
      'Ligar as PRs de acme/web e acme/api uma à outra no corpo',
      'Criar a tag v1 no commit 0123456 de acme/api',
      'Publicar a GitHub Release “Release v1” em acme/api',
    ])
    expect(sidesText(['front', 'back'])).toBe('front e back')
  })

  it('summarizes reviews and decides when a PR can be published', () => {
    expect(approvalsText({ approved: [], changesRequested: [] })).toBe('Sem review')
    expect(approvalsText({ approved: ['a'], changesRequested: ['b', 'c'] })).toBe(
      '1 aprovação · 2 pedidos de ajuste',
    )
    expect(approvalsText({ approved: ['a', 'b'], changesRequested: ['c'] })).toBe(
      '2 aprovações · 1 pedido de ajuste',
    )
    expect(canPublish(tracked())).toBe(true)
    expect(canPublish(tracked({ state: 'open' }))).toBe(false)
    expect(canPublish(tracked({ published: { tag: 'v1', url: 'u' } }))).toBe(false)
  })

  it('keeps the route handler message and falls back by status', () => {
    expect(errorMessage(409, { error: 'O plano mudou' })).toBe('O plano mudou')
    expect(errorMessage(429, null)).toContain('Espere um minuto')
    expect(errorMessage(502, { message: 'x' })).toContain('Não foi possível')
  })

  it('turns an audit entry into one line for the history', () => {
    expect(runSummary(run({ status: 'rejected', error: 'Plano mudou.' }))).toBe('Plano mudou.')
    expect(runSummary(run({ status: 'rejected' }))).toBe('Execução recusada.')
    expect(runSummary(run({ release: { repo: 'acme/api', number: 9, tag: 'v1', url: 'u' } }))).toBe(
      'Tag v1 publicada',
    )
    expect(
      runSummary(
        run({
          pulls: [
            { sides: ['back'], repo: 'acme/api', number: 1, url: 'a', action: 'created' },
            { sides: ['front'], repo: 'acme/web', number: 2, url: 'b', action: 'updated' },
          ],
          branches: [{ repo: 'acme/api', name: 'release/x' }],
        }),
      ),
    ).toBe('1 PR(s) aberta(s), 1 PR(s) atualizada(s), 1 branch(es) criada(s)')
    expect(runSummary(run({ status: 'failed', error: 'GitHub 403' }))).toBe(
      'Nada escrito. Erro: GitHub 403',
    )
  })
})
