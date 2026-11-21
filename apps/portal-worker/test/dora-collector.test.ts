import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChangeInput, DeployInput, IncidentInput } from '@lab/database'
import { describe, expect, it, vi } from 'vitest'
import { createDoraCollector } from '../src/collectors/dora/collector.js'
import { createFixtureSource } from '../src/collectors/dora/fixture-source.js'
import type { DeliverySource } from '../src/collectors/dora/source.js'
import { createLogger } from '../src/logger.js'

const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const NOW = new Date('2026-11-21T12:00:00.000Z')

const writeCatalog = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dora-worker-'))
  const file = join(directory, 'repos.yaml')
  await writeFile(
    file,
    [
      'repos:',
      '  - repo: lab-demo/campanhas-api',
      '    team: Campanhas',
      '    system: campanhas',
      '    source: { type: fixture }',
      '  - repo: lab-demo/campanhas-web',
      '    team: Campanhas',
      '    system: campanhas',
      '    source: { type: github-deployments }',
      '  - repo: lab-demo/notificacoes-worker',
      '    team: Mensageria',
      '    system: notificacoes',
      '    source: { type: github-workflow, workflow: deploy.yml }',
    ].join('\n'),
  )
  return file
}

const stores = () => ({
  deploys: { record: vi.fn((items: DeployInput[]) => Promise.resolve(items.length)) },
  changes: { upsert: vi.fn((_items: ChangeInput[]) => Promise.resolve()) },
  incidents: { upsert: vi.fn((_items: IncidentInput[]) => Promise.resolve()) },
})

const run = async (github: DeliverySource | null) => {
  const lines: string[] = []
  const repositories = stores()
  const collector = createDoraCollector({
    catalogFile: await writeCatalog(),
    incidentsDir: repoPath('catalog/incidents'),
    fixtures: createFixtureSource(repoPath('fixtures/dora')),
    github,
    ...repositories,
    intervalMs: 60_000,
  })
  const outcome = await collector
    .run({ now: NOW, logger: createLogger((line) => lines.push(line)) })
    .then(() => null)
    .catch((error: unknown) => error)
  return { collector, outcome, repositories, logs: lines.map((line) => JSON.parse(line)) }
}

describe('DORA collector', () => {
  it('stores fixture repositories and skips GitHub ones without a token', async () => {
    const { collector, outcome, repositories, logs } = await run(null)
    expect(collector).toMatchObject({ name: 'dora', schedule: { intervalMs: 60_000 } })
    expect(outcome).toBeNull()
    expect(repositories.incidents.upsert.mock.calls[0]?.[0]).toHaveLength(6)
    const deploys = repositories.deploys.record.mock.calls[0]?.[0] ?? []
    expect(deploys.length).toBeGreaterThan(50)
    expect(deploys.every((deploy) => deploy.repo === 'lab-demo/campanhas-api')).toBe(true)
    expect(deploys.every((deploy) => deploy.deployedAt >= '2026-08-15')).toBe(true)
    expect(logs.filter((log) => log.msg === 'dora.repo.skipped').map((log) => log.repo)).toEqual([
      'lab-demo/campanhas-web',
      'lab-demo/notificacoes-worker',
    ])
  })

  it('keeps collecting after a repository fails and reports the failure at the end', async () => {
    const collect = vi.fn<DeliverySource['collect']>((repo) =>
      repo.repo === 'lab-demo/campanhas-web'
        ? Promise.reject(new Error('GitHub respondeu 500'))
        : Promise.resolve({ deploys: [], changes: [] }),
    )
    const { outcome, repositories, logs } = await run({ collect })
    expect(collect.mock.calls.map(([repo, since]) => [repo.repo, since])).toEqual([
      ['lab-demo/campanhas-web', '2026-08-15T12:00:00.000Z'],
      ['lab-demo/notificacoes-worker', '2026-08-15T12:00:00.000Z'],
    ])
    expect(outcome).toEqual(new Error('Coleta DORA falhou em lab-demo/campanhas-web'))
    expect(repositories.deploys.record).toHaveBeenCalledTimes(2)
    expect(logs.find((log) => log.msg === 'dora.repo.failed')).toMatchObject({
      repo: 'lab-demo/campanhas-web',
      error: { message: 'GitHub respondeu 500' },
    })
  })

  it('serves nothing for a repository without fixture', async () => {
    const source = createFixtureSource(repoPath('fixtures/dora'))
    const result = await source.collect(
      {
        repo: 'lab-demo/sem-fixture',
        team: 'X',
        system: 'x',
        productionEnvironment: 'production',
        defaultBranch: 'main',
        source: { type: 'fixture' },
      },
      '2026-01-01T00:00:00.000Z',
    )
    expect(result).toEqual({ deploys: [], changes: [] })
  })
})
