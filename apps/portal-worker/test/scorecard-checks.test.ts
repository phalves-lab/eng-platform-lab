import { fileURLToPath } from 'node:url'
import { type RepoCatalogEntry, RepoCatalogEntrySchema, type ScorecardPolicy } from '@lab/contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadScorecardPolicy } from '../src/collectors/scorecard/catalog.js'
import {
  CHECKS,
  failedRepo,
  levelOf,
  overallScore,
  scoreRepo,
} from '../src/collectors/scorecard/checks.js'
import type { RepoFacts } from '../src/collectors/scorecard/facts.js'

const POLICY = fileURLToPath(new URL('../../../catalog/scorecard/policy.yaml', import.meta.url))
const NOW = new Date('2026-11-21T12:00:00.000Z')

const entry: RepoCatalogEntry = RepoCatalogEntrySchema.parse({
  id: 'pedidos',
  repo: 'lab-ficticio/pedidos',
  name: 'Pedidos',
  team: 'Vendas',
})

const branch = (name: string, overrides: Partial<RepoFacts['branches'][number]> = {}) => ({
  name,
  exists: true,
  protection: 'ruleset' as const,
  requiresPullRequest: true,
  blocksForcePush: true,
  blocksDeletion: true,
  mergeQueue: true,
  ...overrides,
})

const facts = (overrides: Partial<RepoFacts> = {}): RepoFacts => ({
  defaultBranch: 'main',
  branches: [branch('main'), branch('develop')],
  workflows: [
    {
      path: '.github/workflows/ci.yml',
      content: 'jobs:\n  gates:\n    uses: "./.github/workflows/verify.yml"\n',
    },
    { path: '.github/workflows/verify.yml', content: 'steps:\n  - run: npm run diff-coverage\n' },
    { path: '.github/workflows/release-summary.yml', content: 'name: release-summary\n' },
  ],
  agentsMd: { present: true, updatedAt: '2026-11-01T00:00:00.000Z' },
  nvmrc: '22',
  secretScanning: { secretScanning: true, pushProtection: true },
  dependabotAlerts: { critical: 0, high: 0, medium: 0, low: 0 },
  codeScanning: { enabled: true, alerts: { critical: 0, high: 0, medium: 0, low: 0 } },
  labels: ['release', 'pre-release-notes'],
  ...overrides,
})

describe('scorecard checks', () => {
  let policy: ScorecardPolicy
  const check = (input: RepoFacts, id: keyof typeof CHECKS) =>
    scoreRepo(entry, input, policy, NOW).checks.find((item) => item.id === id)

  beforeAll(async () => {
    policy = await loadScorecardPolicy(POLICY)
  })

  it('gives 100 to a repository that follows every standard, with no fix to show', () => {
    const scorecard = scoreRepo(entry, facts(), policy, NOW)
    expect(scorecard).toMatchObject({
      score: 100,
      level: 'good',
      url: 'https://github.com/lab-ficticio/pedidos',
      error: null,
    })
    expect(scorecard.checks.map((item) => item.id)).toEqual(Object.keys(CHECKS))
    expect(scorecard.checks.every((item) => item.status === 'pass' && item.fix === null)).toBe(true)
    expect(scorecard.checks.reduce((sum, item) => sum + item.weight, 0)).toBe(100)
    expect(scorecard.checks.find((item) => item.id === 'coverage')?.standardId).toBe('ENG-QA-01')
  })

  it('scores each missing branch rule and reports branches that do not exist', () => {
    const partial = check(
      facts({ branches: [branch('main', { blocksForcePush: false, blocksDeletion: false })] }),
      'branch-protection',
    )
    expect(partial).toMatchObject({ status: 'partial', score: 17 })
    expect(partial?.detail).toBe('main aceita force push e pode ser apagada; develop não existe.')
    expect(partial?.fix).toContain('policy/rulesets/main.json')
    const unprotected = check(
      facts({
        branches: [
          branch('main', {
            requiresPullRequest: false,
            blocksForcePush: false,
            blocksDeletion: false,
          }),
        ],
      }),
      'branch-protection',
    )
    expect(unprotected).toMatchObject({ status: 'fail', score: 0 })
    expect(unprotected?.detail).toContain('aceita push direto')
  })

  it('marks branch protection as unknown when the classic rules could not be read', () => {
    const result = check(
      facts({ branches: [branch('main', { protection: 'unknown', blocksDeletion: false })] }),
      'branch-protection',
    )
    expect(result).toMatchObject({ status: 'unknown', score: null })
    expect(result?.fix).toContain('token do coletor')
  })

  it('requires the merge queue on the default branch', () => {
    expect(
      check(facts({ branches: [branch('main', { mergeQueue: false })] }), 'merge-queue'),
    ).toMatchObject({ status: 'fail', detail: 'main não exige fila de merge.' })
  })

  it('recognizes local and remote reusable workflow calls, but not plain actions', () => {
    expect(check(facts(), 'reusable-ci')?.detail).toBe(
      'ci.yml chama ./.github/workflows/verify.yml.',
    )
    const remote = facts({
      workflows: [
        {
          path: '.github/workflows/ci.yml',
          content: 'jobs:\n  node:\n    uses: lab-ficticio/esteira/.github/workflows/ci.yaml@v3\n',
        },
      ],
    })
    expect(check(remote, 'reusable-ci')?.status).toBe('pass')
    const copied = facts({
      workflows: [{ path: 'ci.yml', content: 'steps:\n  - uses: actions/checkout@v5\n' }],
    })
    expect(check(copied, 'reusable-ci')).toMatchObject({ status: 'fail' })
    expect(check(copied, 'coverage')).toMatchObject({
      status: 'fail',
      detail: 'Nenhum workflow publica cobertura de testes.',
    })
  })

  it('accepts AGENTS.md within the age limit and halves the score when it is old or undated', () => {
    expect(check(facts(), 'agents-md')?.detail).toBe('AGENTS.md atualizado há 20 dias.')
    expect(
      check(
        facts({ agentsMd: { present: true, updatedAt: '2026-07-01T00:00:00.000Z' } }),
        'agents-md',
      ),
    ).toMatchObject({ score: 50, detail: 'AGENTS.md sem commit há 143 dias (limite de 90).' })
    expect(check(facts({ agentsMd: { present: true, updatedAt: null } }), 'agents-md')?.score).toBe(
      50,
    )
    expect(
      check(facts({ agentsMd: { present: false, updatedAt: null } }), 'agents-md'),
    ).toMatchObject({ status: 'fail', score: 0 })
  })

  it('needs both secret scanning and push protection, and says when it cannot read them', () => {
    expect(
      check(
        facts({ secretScanning: { secretScanning: true, pushProtection: false } }),
        'secret-scanning',
      ),
    ).toMatchObject({ score: 50, detail: 'Desligado: push protection.' })
    expect(
      check(
        facts({ secretScanning: { secretScanning: false, pushProtection: false } }),
        'secret-scanning',
      )?.detail,
    ).toBe('Desligado: secret scanning e push protection.')
    expect(
      check(
        facts({ secretScanning: { secretScanning: null, pushProtection: true } }),
        'secret-scanning',
      )?.status,
    ).toBe('unknown')
  })

  it('checks the Node major of .nvmrc against the policy', () => {
    expect(check(facts({ nvmrc: 'v24.11.0' }), 'node-version')?.status).toBe('pass')
    expect(check(facts({ nvmrc: '20' }), 'node-version')).toMatchObject({
      status: 'fail',
      detail: 'Node 20 fora da política (aceita 22, 24).',
    })
    expect(check(facts({ nvmrc: 'lts/*' }), 'node-version')?.detail).toContain('não fixa')
    expect(check(facts({ nvmrc: null }), 'node-version')?.detail).toBe(
      'Sem .nvmrc; a política aceita 22, 24.',
    )
  })

  it('subtracts the penalty of each open alert by severity', () => {
    const alerts = { critical: 2, high: 2, medium: 0, low: 1 }
    expect(check(facts({ dependabotAlerts: alerts }), 'dependabot-alerts')).toMatchObject({
      status: 'fail',
      score: 0,
      detail: '5 alertas abertos de Dependabot: 2 críticos, 2 altos e 1 baixo.',
    })
    expect(
      check(facts({ dependabotAlerts: { ...alerts, critical: 0, high: 0 } }), 'dependabot-alerts'),
    ).toMatchObject({ status: 'partial', score: 95, detail: expect.stringContaining('1 alerta') })
    expect(check(facts({ dependabotAlerts: null }), 'dependabot-alerts')?.status).toBe('unknown')
    expect(
      check(facts({ codeScanning: { enabled: false } }), 'code-scanning-alerts'),
    ).toMatchObject({ status: 'fail', detail: 'Code scanning não está configurado.' })
    expect(check(facts({ codeScanning: null }), 'code-scanning-alerts')?.status).toBe('unknown')
    expect(
      check(
        facts({ codeScanning: { enabled: true, alerts: { ...alerts, critical: 0, high: 1 } } }),
        'code-scanning-alerts',
      )?.score,
    ).toBe(75)
  })

  it('splits the release flow between the workflow and the labels', () => {
    expect(check(facts({ workflows: [], labels: ['release'] }), 'release-flow')).toMatchObject({
      score: 25,
      detail: 'Falta workflow release-summary.yml e rótulo pre-release-notes.',
    })
    expect(check(facts({ workflows: [], labels: [] }), 'release-flow')).toMatchObject({
      status: 'fail',
      score: 0,
    })
    expect(
      scoreRepo(entry, facts({ labels: [] }), { ...policy, releaseLabels: [] }, NOW).checks.at(-1)
        ?.score,
    ).toBe(100)
  })

  it('weighs only readable checks and maps the score to the policy levels', () => {
    const scorecard = scoreRepo(
      { ...entry, source: 'fixture' },
      facts({
        secretScanning: { secretScanning: null, pushProtection: null },
        dependabotAlerts: null,
        nvmrc: '18',
      }),
      policy,
      NOW,
    )
    expect(scorecard.url).toBeNull()
    expect(scorecard.score).toBe(93)
    expect(overallScore([])).toBeNull()
    expect(levelOf(null, policy)).toBe('unknown')
    expect(levelOf(80, policy)).toBe('good')
    expect(levelOf(50, policy)).toBe('attention')
    expect(levelOf(49, policy)).toBe('critical')
    expect(failedRepo(entry, 'falhou')).toMatchObject({
      score: null,
      level: 'unknown',
      checks: [],
      error: 'falhou',
    })
  })
})
