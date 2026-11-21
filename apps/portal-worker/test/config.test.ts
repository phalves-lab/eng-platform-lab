import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

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
})
