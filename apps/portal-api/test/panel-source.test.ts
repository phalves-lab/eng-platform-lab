import { ServiceUnavailableException } from '@nestjs/common'
import type { MetricSnapshot } from '@lab/database'
import { describe, expect, it, vi } from 'vitest'
import {
  DatabasePanelSource,
  FilePanelSource,
  createPanelSource,
} from '../src/review/panel-source.js'

const snapshot = (dataset: string, generatedAt: string) =>
  ({
    dataset,
    day: generatedAt.slice(0, 10),
    collectedAt: generatedAt,
    payload: { id: dataset, generatedAt },
  }) as unknown as MetricSnapshot

describe('DatabasePanelSource', () => {
  it('lists the primary dataset first and stamps the newest generation time', async () => {
    const source = new DatabasePanelSource({
      latest: () =>
        Promise.resolve([
          snapshot('alpha', '2026-11-19T12:00:00.000Z'),
          snapshot('demo', '2026-11-20T12:00:00.000Z'),
          snapshot('lab', '2026-11-18T12:00:00.000Z'),
        ]),
    })
    const data = await source.load()
    expect(data.datasets.map((d) => d.id)).toEqual(['lab', 'alpha', 'demo'])
    expect(data).toMatchObject({ schemaVersion: 1, generatedAt: '2026-11-20T12:00:00.000Z' })
  })

  it('answers 503 while the worker has not written anything or the schema is missing', async () => {
    await expect(
      new DatabasePanelSource({ latest: () => Promise.resolve([]) }).load(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    const missingTable = Object.assign(new Error('relation does not exist'), { code: '42P01' })
    await expect(
      new DatabasePanelSource({ latest: () => Promise.reject(missingTable) }).load(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('lets unexpected database errors surface and closes the pool on shutdown', async () => {
    const end = vi.fn(() => Promise.resolve())
    const source = new DatabasePanelSource(
      { latest: () => Promise.reject(new Error('connection refused')) },
      { end },
    )
    await expect(source.load()).rejects.toThrow('connection refused')
    await source.onModuleDestroy()
    expect(end).toHaveBeenCalledOnce()
  })
})

describe('createPanelSource', () => {
  it('picks the source from the configuration', async () => {
    expect(createPanelSource({ kind: 'file', path: '/nope/data.json' })).toBeInstanceOf(
      FilePanelSource,
    )
    const database = createPanelSource({ kind: 'database', url: 'postgres://x@127.0.0.1:1/x' })
    expect(database).toBeInstanceOf(DatabasePanelSource)
    await (database as DatabasePanelSource).onModuleDestroy()
  })
})
