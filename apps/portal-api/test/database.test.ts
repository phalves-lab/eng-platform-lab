import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { MetricSnapshotRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { collectPanelData } from '@lab/eng-metrics/collect'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('portal-api reading from Postgres', () => {
  let db: IsolatedSchema
  let app: INestApplication

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
    const module = await Test.createTestingModule({
      imports: [
        AppModule.register(
          loadConfig({
            NODE_ENV: 'test',
            PORTAL_HANDBOOK_DIR: HANDBOOK,
            DATABASE_URL: db.connectionString,
          }),
        ),
      ],
    }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await db.drop()
  })

  it('answers 503 until the worker stores a snapshot', async () => {
    await request(app.getHttpServer()).get('/api/review/datasets').expect(503)
  })

  it('serves the latest snapshot of each dataset', async () => {
    const snapshots = new MetricSnapshotRepository(db.pool)
    const yesterday = await collectPanelData({ lab: null, demo: true }, '2026-11-19T12:00:00.000Z')
    const today = await collectPanelData({ lab: null, demo: true }, '2026-11-20T12:00:00.000Z')
    for (const [day, data] of [
      ['2026-11-19', yesterday],
      ['2026-11-20', today],
    ] as const) {
      for (const payload of data.datasets) {
        await snapshots.save({ day, payload, collectedAt: data.generatedAt })
      }
    }

    const server = app.getHttpServer()
    const datasets = await request(server).get('/api/review/datasets').expect(200)
    expect(datasets.body).toEqual([
      {
        id: 'demo',
        title: 'Exemplo com time de 8',
        label: 'Exemplo: time fictício de 8 pessoas',
        generatedAt: '2026-11-20T12:00:00.000Z',
      },
    ])
    const dataset = await request(server).get('/api/review/datasets/demo').expect(200)
    expect(dataset.body.queue).toEqual(today.datasets[0]?.queue)
    await request(server).get('/api/review/datasets/lab').expect(404)
    const mine = await request(server).get('/api/me/review?dataset=demo').expect(200)
    expect(mine.body).toMatchObject({ dataset: 'demo', toReview: [], mine: [] })
  })
})
