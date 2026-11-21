import { ReleaseProjectSchema } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildWarnings,
  deployOrder,
  extractEnv,
  extractSql,
  extractSummary,
  findCutoff,
  findOpenRelease,
  groupByTicket,
  renderReleaseBranch,
  summarizeChecks,
  ticketKeyOf,
  unionAuthors,
} from '../src/releases/rules.js'
import { pull } from './fake-github.js'

const project = ReleaseProjectSchema.parse({
  id: 'demo',
  name: 'Demo',
  repos: { back: 'acme/api' },
})

const TEMPLATE_BODY = `**Task:** [LAB-7](https://exemplo.atlassian.net/browse/LAB-7)

## Contexto de negócio

<!-- Para que serve -->

## SQL (se aplicável)

\`\`\`sql
-- migrations ou alterações de banco desta entrega
\`\`\`

## ENV (se aplicável)

<!-- Variáveis novas -->

## Uso de IA
`

describe('ticket key', () => {
  it('reads the branch first, then the title, then the Task line', () => {
    expect(ticketKeyOf({ headRef: 'feat/LAB-1-x', title: 'feat: LAB-2', body: '' })).toBe('LAB-1')
    expect(ticketKeyOf({ headRef: 'feat/x', title: 'feat(api): LAB-2 algo', body: '' })).toBe(
      'LAB-2',
    )
    expect(ticketKeyOf({ headRef: 'feat/x', title: 'feat: algo', body: TEMPLATE_BODY })).toBe(
      'LAB-7',
    )
    expect(
      ticketKeyOf({ headRef: 'feat/x', title: 'feat: algo', body: 'segue o ENG-QA-01' }),
    ).toBeNull()
  })
})

describe('SQL and ENV extraction', () => {
  it('keeps only SQL blocks with real statements', () => {
    expect(extractSql(TEMPLATE_BODY)).toEqual([])
    expect(extractSql('```sql\n-- Não aplicável\n```')).toEqual([])
    expect(extractSql('```sql\nN/A\n```')).toEqual([])
    expect(extractSql('```sql\nNão aplicável.\n```')).toEqual([])
    expect(
      extractSql(
        '```sql\n-- cria coluna\nALTER TABLE a ADD COLUMN b int;\n```\n```SQL\nSELECT 1;\n```',
      ),
    ).toEqual(['-- cria coluna\nALTER TABLE a ADD COLUMN b int;', 'SELECT 1;'])
    expect(extractSql('```ts\nALTER TABLE a;\n```')).toEqual([])
  })

  it('reads ENV names and notes, ignoring placeholders and N/A', () => {
    expect(extractEnv(TEMPLATE_BODY)).toEqual({ names: [], notes: [] })
    expect(extractEnv('## ENV\n\nN/A\n\n## Uso de IA')).toEqual({ names: [], notes: [] })
    expect(extractEnv('## ENV (se aplicável)\n\n- Não se aplica\n')).toEqual({
      names: [],
      notes: [],
    })
    expect(
      extractEnv(
        '## ENV\n\n- `PORTAL_GITHUB_TOKEN`: token de leitura (local e homologação)\n- PORT=4150 opcional\n- `REDIS_URL` e FEATURE_X_ON\n\n## Uso de IA\n- nada',
      ),
    ).toEqual({
      names: ['PORTAL_GITHUB_TOKEN', 'REDIS_URL', 'FEATURE_X_ON'],
      notes: [
        '`PORTAL_GITHUB_TOKEN`: token de leitura (local e homologação)',
        'PORT=4150 opcional',
        '`REDIS_URL` e FEATURE_X_ON',
      ],
    })
  })

  it('summarizes the business context and skips empty sections', () => {
    expect(extractSummary(TEMPLATE_BODY)).toBeNull()
    expect(
      extractSummary('## Contexto de negócio\n\nPermite ver a release.\nAntes.\n\nOutro.'),
    ).toBe('Permite ver a release. Antes.')
    expect(extractSummary(`## Descrição\n\n${'a'.repeat(400)}`)).toHaveLength(280)
  })
})

describe('cutoff', () => {
  const merged = [
    pull({
      number: 40,
      baseRef: 'main',
      headRef: 'develop',
      labels: ['release'],
      mergedAt: '2026-10-01T00:00:00Z',
    }),
    pull({
      number: 50,
      baseRef: 'main',
      headRef: 'develop',
      labels: ['release'],
      mergedAt: '2026-11-01T00:00:00Z',
    }),
    pull({
      number: 45,
      baseRef: 'main',
      headRef: 'hotfix/LAB-9-x',
      mergedAt: '2026-11-05T00:00:00Z',
    }),
    pull({
      number: 46,
      baseRef: 'main',
      headRef: 'feat/x',
      labels: ['release'],
      mergedAt: '2026-11-06T00:00:00Z',
    }),
  ]

  it('uses the newest merged release PR from the source and ignores other PRs', () => {
    expect(findCutoff(project, 'develop', merged, [])).toEqual({
      kind: 'release-pr',
      ref: '#50',
      at: '2026-11-01T00:00:00Z',
      url: 'https://github.example/pr/50',
    })
    const unlabeled = merged.map((item) => ({ ...item, labels: [] }))
    expect(findCutoff(project, 'develop', unlabeled, []).kind).toBe('none')
  })

  it('accepts a release branch as the head', () => {
    const fromBranch = [
      ...merged,
      pull({
        number: 70,
        baseRef: 'main',
        headRef: 'release/2026-11-10',
        labels: ['release'],
        mergedAt: '2026-11-10T00:00:00Z',
      }),
    ]
    expect(findCutoff(project, 'develop', fromBranch, []).ref).toBe('#70')
  })

  it('falls back to the newest tag by date', () => {
    const tags = [
      { name: 'v1.1.0', date: '2026-10-01T00:00:00Z', url: 'u1' },
      { name: 'v1.2.0', date: '2026-11-02T00:00:00Z', url: 'u2' },
      { name: 'v0.9.0', date: null, url: 'u0' },
    ]
    expect(findCutoff(project, 'develop', [], tags)).toEqual({
      kind: 'tag',
      ref: 'v1.2.0',
      at: '2026-11-02T00:00:00Z',
      url: 'u2',
    })
    expect(findCutoff(project, 'develop', [], [])).toEqual({
      kind: 'none',
      ref: null,
      at: null,
      url: null,
    })
  })
})

describe('grouping by ticket', () => {
  const pulls = [
    pull({
      number: 53,
      headRef: 'fix/LAB-61-y',
      author: 'bruno',
      mergedAt: '2026-11-03T00:00:00Z',
      body: '## ENV\n\n- `NEW_FLAG`\n',
    }),
    pull({
      number: 52,
      title: 'feat(api): LAB-61 importa campanhas',
      headRef: 'feat/LAB-61-x',
      mergedAt: '2026-11-02T00:00:00Z',
      body: '## Contexto de negócio\n\nImporta.\n\n```sql\nALTER TABLE a ADD b int;\n```',
    }),
    pull({
      number: 54,
      title: 'chore: deps',
      headRef: 'dependabot/npm/x',
      author: 'dependabot[bot]',
      mergedAt: '2026-11-04T00:00:00Z',
    }),
    pull({
      number: 55,
      headRef: 'feat/LAB-62-z',
      mergedAt: '2026-11-01T00:00:00Z',
      body: '```sql\n-- Não aplicável\n```',
    }),
  ]

  it('groups PRs of the same ticket in merge order and flags them', () => {
    const tickets = groupByTicket(pulls, 'https://exemplo.atlassian.net/browse/{key}')
    expect(tickets.map((ticket) => ticket.key)).toEqual(['LAB-62', 'LAB-61', null])
    const [, multi, loose] = tickets
    expect(multi?.pulls.map((item) => item.number)).toEqual([52, 53])
    expect(multi?.multiplePulls).toBe(true)
    expect(multi?.title).toBe('importa campanhas')
    expect(multi?.summary).toBe('Importa.')
    expect(multi?.url).toBe('https://exemplo.atlassian.net/browse/LAB-61')
    expect(multi?.authors).toEqual(['ana', 'bruno'])
    expect(multi?.sql).toEqual(['ALTER TABLE a ADD b int;'])
    expect(multi?.env.names).toEqual(['NEW_FLAG'])
    expect(tickets[0]?.sql).toEqual([])
    expect(tickets[0]?.multiplePulls).toBe(false)
    expect(loose).toMatchObject({ key: null, url: null, title: 'deps', authors: [] })
  })

  it('unites authors without duplicates or bots', () => {
    expect(unionAuthors(['ana', 'bruno', 'ana', 'dependabot[bot]', 'github-actions', ''])).toEqual([
      'ana',
      'bruno',
    ])
  })
})

describe('checks, open release, warnings and deploy order', () => {
  it('collapses check runs into one state', () => {
    expect(summarizeChecks([]).state).toBe('none')
    expect(summarizeChecks([{ name: 'a', status: 'completed', conclusion: 'success' }]).state).toBe(
      'success',
    )
    expect(
      summarizeChecks([
        { name: 'a', status: 'in_progress', conclusion: null },
        { name: 'lint', status: 'completed', conclusion: 'failure' },
      ]),
    ).toEqual({ state: 'failure', total: 2, failed: ['lint'], pending: 1 })
    expect(summarizeChecks([{ name: 'a', status: 'queued', conclusion: null }]).state).toBe(
      'pending',
    )
  })

  it('finds the open release PR from the source, a release branch or with the label', () => {
    const open = [
      pull({ number: 1, baseRef: 'main', headRef: 'feat/x', mergedAt: null }),
      pull({ number: 2, baseRef: 'main', headRef: 'develop', mergedAt: null }),
    ]
    expect(findOpenRelease(project, 'develop', open)?.number).toBe(2)
    expect(findOpenRelease(project, 'beta', open)).toBeNull()
    const labeled = [
      pull({ number: 3, baseRef: 'main', headRef: 'x', labels: ['release'], mergedAt: null }),
    ]
    expect(findOpenRelease(project, 'beta', labeled)?.number).toBe(3)
    const branch = [
      pull({ number: 4, baseRef: 'main', headRef: 'release/2026-11-01', mergedAt: null }),
    ]
    expect(findOpenRelease(project, 'beta', branch)?.head).toBe('release/2026-11-01')
  })

  const base = {
    source: 'develop',
    target: 'main',
    compare: { aheadBy: 3, behindBy: 0 },
    pulls: 2,
    cutoff: { kind: 'release-pr' as const, ref: '#1', at: 'x', url: 'u' },
    checks: { state: 'success' as const, total: 1, failed: [], pending: 0 },
    openRelease: null,
  }
  const codes = (input: Partial<Parameters<typeof buildWarnings>[0]>) =>
    buildWarnings({ ...base, ...input }).map((warning) => warning.code)

  it('warns about nothing new, target ahead, conflict and checks', () => {
    expect(codes({})).toEqual([])
    expect(codes({ compare: { aheadBy: 0, behindBy: 0 } })).toEqual(['nothing-new'])
    expect(codes({ pulls: 0 })).toEqual(['nothing-new'])
    expect(codes({ compare: { aheadBy: 3, behindBy: 2 } })).toEqual(['target-ahead'])
    expect(
      codes({
        openRelease: { number: 9, title: 't', url: 'u', head: 'develop', mergeable: false },
      }),
    ).toEqual(['conflict', 'open-release'])
    expect(
      codes({ openRelease: { number: 9, title: 't', url: 'u', head: 'develop', mergeable: true } }),
    ).toEqual(['open-release'])
    expect(codes({ cutoff: { kind: 'none', ref: null, at: null, url: null } })).toEqual([
      'no-cutoff',
    ])
    expect(codes({ checks: { state: 'failure', total: 1, failed: ['lint'], pending: 0 } })).toEqual(
      ['checks-failing'],
    )
    expect(codes({ checks: { state: 'pending', total: 1, failed: [], pending: 1 } })).toEqual([
      'checks-pending',
    ])
  })

  it('puts the back first when it carries a migration', () => {
    const frontFirst = ReleaseProjectSchema.parse({
      ...project,
      deploy: { order: ['front', 'back'] },
    })
    const withSql = groupByTicket([pull({ number: 1, body: '```sql\nSELECT 1;\n```' })])
    const withoutSql = groupByTicket([pull({ number: 1 })])
    expect(deployOrder(frontFirst, withSql)).toEqual({
      sides: ['back', 'front'],
      reason: 'migration',
    })
    expect(deployOrder(frontFirst, withoutSql)).toEqual({
      sides: ['front', 'back'],
      reason: 'config',
    })
    const off = ReleaseProjectSchema.parse({
      ...project,
      deploy: { order: ['front', 'back'], backFirstOnMigration: false },
    })
    expect(deployOrder(off, withSql).sides).toEqual(['front', 'back'])
  })

  it('renders the release branch on the São Paulo date', () => {
    expect(renderReleaseBranch('release/{yyyy}-{mm}-{dd}', new Date('2026-11-21T02:00:00Z'))).toBe(
      'release/2026-11-20',
    )
    expect(renderReleaseBranch('release/v{yyyy}.{mm}', new Date('2026-01-05T12:00:00Z'))).toBe(
      'release/v2026.01',
    )
  })
})

describe('release catalog schema', () => {
  it('fills defaults and rejects broken projects', () => {
    expect(project).toMatchObject({
      source: 'develop',
      target: 'main',
      mode: 'pr',
      labels: { release: 'release', notes: 'pre-release-notes' },
      deploy: { order: ['back', 'front'], backFirstOnMigration: true },
    })
    const invalid = (overrides: Record<string, unknown>) =>
      ReleaseProjectSchema.safeParse({ id: 'x', name: 'X', repos: { back: 'a/b' }, ...overrides })
        .success
    expect(invalid({ repos: {} })).toBe(false)
    expect(invalid({ repos: { front: 'sem-barra' } })).toBe(false)
    expect(invalid({ source: 'main' })).toBe(false)
    expect(invalid({ releaseBranch: 'rel/{yyyy}' })).toBe(false)
    expect(invalid({ releaseBranch: 'release/{yyyy}..x' })).toBe(false)
    expect(invalid({ deploy: { order: ['back', 'back'] } })).toBe(false)
    expect(invalid({ ticketUrl: 'ftp.example/{key}' })).toBe(false)
    expect(invalid({ mode: 'tag' })).toBe(false)
    expect(invalid({ mode: 'branch', releaseBranch: 'release/{yyyy}.{mm}' })).toBe(true)
  })
})
