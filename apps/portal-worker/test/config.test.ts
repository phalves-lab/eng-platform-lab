import { describe, expect, it } from 'vitest'
import { loadConfig, loadJiraCommandConfig, loadJiraConfig } from '../src/config.js'

const DATABASE_URL = 'postgres://lab:lab@localhost:5433/lab'

describe('worker configuration', () => {
  it('collects only the lab every hour by default, with fixture tasks', () => {
    const config = loadConfig({
      DATABASE_URL,
      GITHUB_TOKEN: 'token',
      GITHUB_REPOSITORY: 'phalves-lab/eng-platform-lab',
    })
    expect(config).toMatchObject({
      databaseUrl: DATABASE_URL,
      intervalMs: 3_600_000,
      timeZone: 'America/Sao_Paulo',
      chatRetentionDays: 90,
      collect: { demo: false, lab: { taskSource: 'fixtures', ci: false } },
    })
    expect(config.collect.lab?.fixturesDir).toMatch(/fixtures\/jira$/)
    expect(config.dora).toMatchObject({
      github: { token: 'token', apiUrl: 'https://api.github.com' },
    })
    expect(config.dora.catalogFile).toMatch(/catalog\/dora\/repos\.yaml$/)
    expect(config.dora.incidentsDir).toMatch(/catalog\/incidents$/)
    expect(config.dora.fixturesDir).toMatch(/fixtures\/dora$/)
  })

  it('accepts the demo dataset alone without GitHub credentials', () => {
    const config = loadConfig({
      DATABASE_URL,
      WORKER_DATASETS: 'demo',
      WORKER_INTERVAL_MINUTES: '15',
      WORKER_TIMEZONE: 'UTC',
      WORKER_CHAT_RETENTION_DAYS: '30',
    })
    expect(config).toMatchObject({ intervalMs: 900_000, timeZone: 'UTC', chatRetentionDays: 30 })
    expect(config.collect).toEqual({ demo: true, lab: null })
    expect(config.dora.github).toBeNull()
  })

  it('fails fast on missing or invalid settings', () => {
    expect(() => loadConfig({})).toThrow('Invalid worker configuration')
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow('postgres:// URL')
    expect(() => loadConfig({ DATABASE_URL })).toThrow('requires GITHUB_TOKEN')
    const demo = { DATABASE_URL, WORKER_DATASETS: 'demo' }
    expect(() => loadConfig({ ...demo, WORKER_INTERVAL_MINUTES: '0' })).toThrow()
    expect(() => loadConfig({ ...demo, WORKER_TIMEZONE: 'Mars/Base' })).toThrow('IANA')
    expect(() => loadConfig({ ...demo, WORKER_CHAT_RETENTION_DAYS: '0' })).toThrow()
    expect(() => loadConfig({ ...demo, WORKER_DATASETS: 'lab,prod' })).toThrow()
    expect(() => loadConfig({ ...demo, WORKER_DATASETS: ' , ' })).toThrow('at least one')
  })

  it('keeps the Jira collector off in the scheduled worker unless it is configured', () => {
    expect(loadConfig({ DATABASE_URL, WORKER_DATASETS: 'demo' }).jira).toBeNull()
    const config = loadConfig({
      DATABASE_URL,
      WORKER_DATASETS: 'demo',
      WORKER_JIRA_SOURCE: 'fixture',
    })
    expect(config.jira?.source).toEqual({
      kind: 'fixture',
      dir: expect.stringMatching(/fixtures\/jira-board$/),
    })
    expect(config.jira?.workflowPath).toMatch(/catalog\/jira\/workflow\.yaml$/)
  })
})

describe('Jira configuration', () => {
  const cloud = {
    WORKER_JIRA_SOURCE: 'cloud',
    ATLASSIAN_SITE: 'https://jira.example.test/',
    ATLASSIAN_EMAIL: 'bot@example.test',
    ATLASSIAN_API_TOKEN: 'fake-token',
    WORKER_JIRA_PROJECTS: 'LAB, OPS',
    WORKER_JIRA_BOARDS: 'LAB=7,OPS=8',
  }

  it('reads the cloud source with projects, boards and defaults', () => {
    expect(loadJiraConfig(cloud)?.source).toEqual({
      kind: 'cloud',
      credentials: {
        site: 'https://jira.example.test',
        email: 'bot@example.test',
        apiToken: 'fake-token',
      },
      projects: ['LAB', 'OPS'],
      boards: [
        { project: 'LAB', boardId: 7 },
        { project: 'OPS', boardId: 8 },
      ],
      sprintField: 'customfield_10020',
      lookbackDays: 120,
    })
  })

  it('refuses a cloud source without credentials, projects or with boards of other projects', () => {
    expect(() => loadJiraConfig({ ...cloud, ATLASSIAN_SITE: 'http://jira.example.test' })).toThrow(
      'requires ATLASSIAN_SITE',
    )
    expect(() => loadJiraConfig({ ...cloud, ATLASSIAN_API_TOKEN: '' })).toThrow(
      'ATLASSIAN_API_TOKEN',
    )
    expect(() => loadJiraConfig({ ...cloud, WORKER_JIRA_PROJECTS: '' })).toThrow(
      'requires WORKER_JIRA_PROJECTS',
    )
    expect(() => loadJiraConfig({ ...cloud, WORKER_JIRA_PROJECTS: 'lab' })).toThrow('project keys')
    expect(() => loadJiraConfig({ ...cloud, WORKER_JIRA_BOARDS: 'XYZ=1' })).toThrow(
      'outside WORKER_JIRA_PROJECTS: XYZ',
    )
    expect(() => loadJiraConfig({ ...cloud, WORKER_JIRA_BOARDS: 'LAB:1' })).toThrow(
      'PROJECT=boardId',
    )
    expect(() => loadJiraConfig({ ...cloud, WORKER_JIRA_SPRINT_FIELD: 'sprint' })).toThrow(
      'customfield',
    )
  })

  it('defaults the one-shot command to the fixture adapter', () => {
    expect(loadJiraCommandConfig({ DATABASE_URL })).toMatchObject({
      databaseUrl: DATABASE_URL,
      jira: { source: { kind: 'fixture' } },
    })
    expect(() => loadJiraCommandConfig({})).toThrow('Invalid worker configuration')
    expect(() => loadJiraCommandConfig({ DATABASE_URL, WORKER_JIRA_SOURCE: 'off' })).toThrow(
      'leaves nothing to collect',
    )
  })
})
