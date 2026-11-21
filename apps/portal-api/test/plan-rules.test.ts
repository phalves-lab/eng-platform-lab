import type { ReleaseTicket } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildChecklist,
  latestApprovals,
  planHash,
  releaseTagBase,
  releaseTagCandidates,
  renderReleaseBody,
  summarizeWorkflow,
  withLink,
} from '../src/releases/plan-rules.js'

const ticket = (overrides: Partial<ReleaseTicket> = {}): ReleaseTicket => ({
  key: 'LAB-1',
  title: 'Importa campanhas',
  url: null,
  summary: null,
  pulls: [
    { number: 3, title: 'feat: importa', url: 'https://gh/pr/3', author: 'ana', mergedAt: '' },
  ],
  authors: ['ana'],
  sql: [],
  env: { names: [], notes: [] },
  multiplePulls: false,
  ...overrides,
})

describe('release plan rules', () => {
  it('hashes the canonical plan, so key order does not matter but content does', () => {
    expect(planHash({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(planHash({ b: [{ d: 3, c: 2 }], a: 1 }))
    expect(planHash({ a: 1 })).not.toBe(planHash({ a: 2 }))
    expect(planHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('builds one checklist across repositories with SQL per block and ENV per ticket', () => {
    const checklist = buildChecklist([
      {
        sides: ['back'],
        repo: 'acme/api',
        tickets: [
          ticket({ sql: ['CREATE TABLE a (id int);', 'CREATE INDEX b ON a (id);'] }),
          ticket({ key: null, env: { names: ['X_Y'], notes: ['`X_Y`: novo'] } }),
        ],
      },
      { sides: ['front'], repo: 'acme/web', tickets: [ticket()] },
    ])
    expect(checklist.sql.map((item) => item.sql)).toEqual([
      'CREATE TABLE a (id int);',
      'CREATE INDEX b ON a (id);',
    ])
    expect(checklist.env).toEqual([
      { sides: ['back'], repo: 'acme/api', key: null, names: ['X_Y'], notes: ['`X_Y`: novo'] },
    ])
  })

  it('renders the release body with empty sections spelled out', () => {
    const body = renderReleaseBody({
      project: { name: 'Lab' },
      sides: ['back'],
      head: 'develop',
      base: 'main',
      date: '2026-11-21',
      tickets: [],
      authors: [],
      deployOrder: null,
      checklist: { sql: [], env: [] },
      linked: null,
    })
    expect(body).toContain('**Release:** Lab · Back · `develop` → `main` · 2026-11-21')
    expect(body).toContain('Nenhum PR novo desde o último corte.')
    expect(body).toContain('Nenhum autor humano.')
    expect(body).toContain('Nenhum SQL nesta release.')
    expect(body).toContain('Nenhuma variável de ambiente nesta release.')
    expect(body).not.toContain('## Ordem de deploy')
    expect(body.endsWith('\n')).toBe(true)

    const full = renderReleaseBody({
      project: { name: 'Lab' },
      sides: ['front'],
      head: 'develop',
      base: 'main',
      date: '2026-11-21',
      tickets: [ticket({ key: null, title: 'deps', summary: 'Atualiza dependências.' })],
      authors: ['ana'],
      deployOrder: { sides: ['front', 'back'], reason: 'config' },
      checklist: {
        sql: [],
        env: [{ sides: ['back'], repo: 'acme/api', key: 'LAB-2', names: [], notes: ['reiniciar'] }],
      },
      linked: { sides: ['back'], repo: 'acme/api', pull: null },
    })
    expect(full).toContain('### Sem ticket: deps')
    expect(full).toContain('Atualiza dependências.')
    expect(full).toContain('Ordem padrão cadastrada para o projeto.')
    expect(full).toContain('- [ ] **Back** · LAB-2\n  - reiniciar')
    expect(
      withLink(full, {
        sides: ['back'],
        repo: 'acme/api',
        pull: { number: 9, url: 'https://gh/9' },
      }),
    ).toContain('**PR ligada:** Back em [acme/api#9](https://gh/9)')
  })

  it('names tags after the version branch or the merge date, with suffixes for taken names', () => {
    expect(releaseTagBase('release/1.4.0', '2026-11-21T12:00:00Z')).toBe('v1.4.0')
    expect(releaseTagBase('release/v2.0.1', '2026-11-21T12:00:00Z')).toBe('v2.0.1')
    expect(releaseTagBase('develop', '2026-11-22T01:00:00Z')).toBe('release-2026-11-21')
    expect(releaseTagCandidates('v1', 3)).toEqual(['v1', 'v1-2', 'v1-3'])
  })

  it('keeps the last decisive review of each person and drops dismissed ones', () => {
    expect(
      latestApprovals([
        { author: 'b', state: 'APPROVED', submittedAt: '2026-11-21T02:00:00Z' },
        { author: 'a', state: 'APPROVED', submittedAt: '2026-11-21T01:00:00Z' },
        { author: 'a', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-21T03:00:00Z' },
        { author: 'c', state: 'APPROVED', submittedAt: null },
        { author: 'c', state: 'DISMISSED', submittedAt: '2026-11-21T04:00:00Z' },
      ]),
    ).toEqual({ approved: ['b'], changesRequested: ['a'] })
  })

  it('reduces the summary workflow to its latest run state', () => {
    expect(summarizeWorkflow([])).toEqual({ state: 'none', url: null })
    expect(summarizeWorkflow([{ status: 'queued', conclusion: null, url: 'u' }]).state).toBe(
      'pending',
    )
    expect(
      summarizeWorkflow([{ status: 'completed', conclusion: 'failure', url: 'u' }]).state,
    ).toBe('failure')
    expect(
      summarizeWorkflow([{ status: 'completed', conclusion: 'skipped', url: 'u' }]).state,
    ).toBe('success')
  })
})
