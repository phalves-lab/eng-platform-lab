import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DoraCatalogError,
  computeDora,
  loadDeliveryFixtures,
  loadDoraCatalog,
  loadIncidents,
} from '../src/index.js'

const repoRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))

const tempDir = () => mkdtemp(join(tmpdir(), 'dora-'))

const writeCatalog = async (yaml: string) => {
  const directory = await tempDir()
  const file = join(directory, 'repos.yaml')
  await writeFile(file, yaml)
  return file
}

const incidentYaml = (id: string, extra = '') =>
  [
    `id: ${id}`,
    'title: Erro na listagem',
    'system: campanhas',
    'severity: sev2',
    "startedAt: '2026-11-18T13:00:00Z'",
    extra,
  ].join('\n')

describe('DORA catalog', () => {
  it('reads repositories with defaults for environment and branch', async () => {
    const file = await writeCatalog(
      [
        'repos:',
        '  - repo: lab-demo/campanhas-api',
        '    team: Campanhas',
        '    system: campanhas',
        '    source: { type: github-workflow, workflow: deploy.yml }',
      ].join('\n'),
    )
    expect(await loadDoraCatalog(file)).toEqual([
      {
        repo: 'lab-demo/campanhas-api',
        team: 'Campanhas',
        system: 'campanhas',
        productionEnvironment: 'production',
        defaultBranch: 'main',
        source: { type: 'github-workflow', workflow: 'deploy.yml' },
      },
    ])
  })

  it('fails with the file name on invalid, repeated or unparsable entries', async () => {
    const entry = [
      '  - repo: lab-demo/campanhas-api',
      '    team: Campanhas',
      '    system: campanhas',
      '    source: { type: fixture }',
    ]
    await expect(
      loadDoraCatalog(await writeCatalog(['repos:', ...entry, ...entry].join('\n'))),
    ).rejects.toThrow('repos.yaml repete o repositório lab-demo/campanhas-api')
    await expect(
      loadDoraCatalog(await writeCatalog('repos:\n  - repo: sem-dono\n    source: { type: ftp }')),
    ).rejects.toThrow(DoraCatalogError)
    await expect(loadDoraCatalog(await writeCatalog('repos: [\n'))).rejects.toThrow(
      'repos.yaml não é YAML válido',
    )
  })
})

describe('incident records', () => {
  it('reads every YAML in the directory and defaults end and cause', async () => {
    const directory = await tempDir()
    await writeFile(join(directory, 'INC-1.yaml'), incidentYaml('INC-1'))
    await writeFile(
      join(directory, 'INC-2.yml'),
      incidentYaml(
        'INC-2',
        "endedAt: '2026-11-18T14:00:00Z'\ncause: { repo: lab-demo/campanhas-api, sha: abc1234 }",
      ),
    )
    await writeFile(join(directory, 'leia-me.txt'), 'ignorado')
    expect(await loadIncidents(directory)).toEqual([
      {
        id: 'INC-1',
        title: 'Erro na listagem',
        system: 'campanhas',
        severity: 'sev2',
        startedAt: '2026-11-18T13:00:00Z',
        endedAt: null,
        cause: null,
      },
      {
        id: 'INC-2',
        title: 'Erro na listagem',
        system: 'campanhas',
        severity: 'sev2',
        startedAt: '2026-11-18T13:00:00Z',
        endedAt: '2026-11-18T14:00:00Z',
        cause: { repo: 'lab-demo/campanhas-api', sha: 'abc1234' },
      },
    ])
    expect(await loadIncidents(join(directory, 'nao-existe'))).toEqual([])
  })

  it('rejects an end before the start, a repeated id and an unknown severity', async () => {
    const ended = await tempDir()
    await writeFile(join(ended, 'a.yaml'), incidentYaml('INC-1', "endedAt: '2026-11-18T12:00:00Z'"))
    await expect(loadIncidents(ended)).rejects.toThrow('a.yaml inválido: endedAt')

    const repeated = await tempDir()
    await writeFile(join(repeated, 'a.yaml'), incidentYaml('INC-1'))
    await writeFile(join(repeated, 'b.yaml'), incidentYaml('INC-1'))
    await expect(loadIncidents(repeated)).rejects.toThrow('b.yaml repete o incidente INC-1')

    const severity = await tempDir()
    await writeFile(join(severity, 'a.yaml'), incidentYaml('INC-1').replace('sev2', 'grave'))
    await expect(loadIncidents(severity)).rejects.toThrow(DoraCatalogError)
  })
})

describe('delivery fixtures', () => {
  it('reads one file per repository and fills the repository in every row', async () => {
    const directory = await tempDir()
    await writeFile(
      join(directory, 'api.json'),
      JSON.stringify({
        repo: 'lab-demo/campanhas-api',
        deploys: [
          {
            environment: 'production',
            sha: 'abc1234',
            deployedAt: '2026-11-18T12:00:00Z',
            status: 'success',
          },
        ],
        changes: [
          {
            pullNumber: 1,
            mergeSha: 'abc1234',
            firstCommitAt: '2026-11-17T12:00:00Z',
            mergedAt: '2026-11-18T10:00:00Z',
          },
        ],
      }),
    )
    const fixtures = await loadDeliveryFixtures(directory)
    expect(fixtures.get('lab-demo/campanhas-api')).toEqual({
      deploys: [
        {
          repo: 'lab-demo/campanhas-api',
          environment: 'production',
          sha: 'abc1234',
          deployedAt: '2026-11-18T12:00:00Z',
          status: 'success',
          url: null,
          commitShas: [],
        },
      ],
      changes: [
        {
          repo: 'lab-demo/campanhas-api',
          pullNumber: 1,
          title: '',
          mergeSha: 'abc1234',
          firstCommitAt: '2026-11-17T12:00:00Z',
          mergedAt: '2026-11-18T10:00:00Z',
        },
      ],
    })
    expect((await loadDeliveryFixtures(join(directory, 'nao-existe'))).size).toBe(0)
  })

  it('names the file and the field of an invalid fixture', async () => {
    const directory = await tempDir()
    await writeFile(
      join(directory, 'web.json'),
      JSON.stringify({ repo: 'lab-demo/campanhas-web', deploys: [{ sha: 'XYZ' }], changes: [] }),
    )
    await expect(loadDeliveryFixtures(directory)).rejects.toThrow('web.json inválido: deploys.0')
  })
})

describe('lab data versioned in the repository', () => {
  it('parses and gives each fictitious repository a different DORA profile', async () => {
    const repos = await loadDoraCatalog(repoRoot('catalog/dora/repos.yaml'))
    const fixtures = await loadDeliveryFixtures(repoRoot('fixtures/dora'))
    const incidents = await loadIncidents(repoRoot('catalog/incidents'))
    const fixtureRepos = repos.filter((entry) => entry.source.type === 'fixture')
    expect(fixtureRepos.map((entry) => entry.repo).sort()).toEqual([...fixtures.keys()].sort())
    for (const item of incidents.filter((record) => record.cause)) {
      const shas = fixtures.get(item.cause?.repo ?? '')?.deploys.map((deploy) => deploy.sha)
      expect(shas, item.id).toContain(item.cause?.sha)
    }

    const result = computeDora({
      repos,
      deploys: [...fixtures.values()].flatMap((data) => data.deploys),
      changes: [...fixtures.values()].flatMap((data) => data.changes),
      incidents,
      now: '2026-11-21T12:00:00.000Z',
      weeks: 12,
    })
    const bands = Object.fromEntries(
      result.repos.map((entry) => [
        entry.repo,
        [
          entry.summary.deploymentFrequency.band,
          entry.summary.leadTime.band,
          entry.summary.changeFailureRate.band,
          entry.summary.timeToRestore.band,
        ],
      ]),
    )
    expect(bands).toEqual({
      'lab-demo/campanhas-api': ['elite', 'elite', 'elite', 'elite'],
      'lab-demo/campanhas-web': ['high', 'high', 'high', 'high'],
      'lab-demo/notificacoes-worker': ['medium', 'medium', 'medium', 'medium'],
      'phalves-lab/eng-platform-lab': [null, null, null, null],
    })
  })
})
