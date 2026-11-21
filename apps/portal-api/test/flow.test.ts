import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BoardResponseSchema, BoardSummarySchema, FlowMetricsResponseSchema } from '@lab/contracts'
import { JiraRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'
import { FLOW_CLOCK } from '../src/flow/flow.service.js'
import { DatabaseJiraData } from '../src/flow/jira-data.js'
import { HANDBOOK, NOW, fakeData, flowDataset, startFlowApp } from './flow-fixtures.js'

describe('flow metrics route', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await startFlowApp(fakeData(flowDataset()))
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves the flow metrics contract with the workflow of each project', async () => {
    const response = await request(app.getHttpServer()).get('/api/metrics/flow').expect(200)
    const body = FlowMetricsResponseSchema.parse(response.body)
    expect(body.filter).toMatchObject({ project: null, component: null, weeks: 10 })
    expect(body.options.projects).toEqual(['LAB', 'OPS'])
    expect(body.throughput).toHaveLength(10)
    expect(body.throughput.at(-1)?.delivered).toBe(1)
    expect(body.cycleTime).toMatchObject({ count: 1, p50: 3 })
    expect(body.wip).toEqual({ total: 2, inProgress: 1, review: 0, blocked: 1 })
    expect(body.blocked.active.map((item) => item.key)).toEqual(['LAB-2'])
    expect(body.unmappedStatuses).toEqual([])
  })

  it('filters by project, component and window and validates the query', async () => {
    const server = app.getHttpServer()
    const ops = await request(server).get('/api/metrics/flow?project=OPS&weeks=4').expect(200)
    expect(ops.body).toMatchObject({ filter: { project: 'OPS', weeks: 4 }, wip: { total: 1 } })
    const collectors = await request(server)
      .get('/api/metrics/flow')
      .query({ project: 'LAB', component: 'Coletores' })
      .expect(200)
    expect(collectors.body.options.components).toEqual(['Coletores', 'Portal'])
    expect(collectors.body.cycleTime.count).toBe(0)
    await request(server).get('/api/metrics/flow?project=lab').expect(400)
    await request(server).get('/api/metrics/flow?weeks=2').expect(400)
    await request(server).get('/api/metrics/flow?weeks=99').expect(400)
  })
})

describe('boards routes', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await startFlowApp(fakeData(flowDataset()))
  })

  afterAll(async () => {
    await app.close()
  })

  it('lists the projects with their size and active sprint', async () => {
    const response = await request(app.getHttpServer()).get('/api/boards').expect(200)
    expect(BoardSummarySchema.array().parse(response.body)).toEqual([
      { project: 'LAB', items: 2, inProgress: 1, activeSprint: 'LAB Sprint 2' },
      { project: 'OPS', items: 1, inProgress: 1, activeSprint: null },
    ])
  })

  it('serves the board of one project in the board contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/boards/LAB').expect(200)
    const board = BoardResponseSchema.parse(response.body)
    expect(board.columns.map((column) => [column.category, column.items.length])).toEqual([
      ['todo', 0],
      ['in_progress', 0],
      ['review', 0],
      ['blocked', 1],
      ['done', 1],
    ])
    expect(board.cfd).toHaveLength(56)
    expect(board.sprints.map((sprint) => [sprint.name, sprint.planned, sprint.added])).toEqual([
      ['LAB Sprint 1', 1, 0],
      ['LAB Sprint 2', 1, 1],
    ])
    expect(board.epics).toEqual([
      expect.objectContaining({ key: 'LAB-9', total: 2, done: 1, percent: 50 }),
    ])
  })

  it('answers 404 for an unknown project and 400 for an invalid key', async () => {
    await request(app.getHttpServer()).get('/api/boards/XYZ').expect(404)
    await request(app.getHttpServer()).get('/api/boards/lab').expect(400)
  })

  it('has no route that writes', async () => {
    await request(app.getHttpServer()).post('/api/boards/LAB').expect(404)
    await request(app.getHttpServer()).put('/api/boards/LAB').expect(404)
    await request(app.getHttpServer()).delete('/api/boards/LAB').expect(404)
  })
})

describe('flow metrics without Jira data', () => {
  it('answers 503 without a database or before the first collection', async () => {
    const noDatabase = await startFlowApp(null)
    await request(noDatabase.getHttpServer()).get('/api/metrics/flow').expect(503)
    await request(noDatabase.getHttpServer()).get('/api/boards').expect(503)
    await request(noDatabase.getHttpServer()).get('/api/boards/LAB').expect(503)
    await noDatabase.close()
    const empty = await startFlowApp(
      fakeData({ issues: [], changes: [], sprints: [], sprintIssues: [] }),
    )
    await request(empty.getHttpServer()).get('/api/metrics/flow').expect(503)
    await request(empty.getHttpServer()).get('/api/boards').expect(503)
    await empty.close()
  })

  it('answers 500 while the workflow file is missing', async () => {
    const app = await startFlowApp(fakeData(flowDataset()), {
      PORTAL_JIRA_WORKFLOW: '/nonexistent/workflow.yaml',
    })
    await request(app.getHttpServer()).get('/api/metrics/flow').expect(500)
    await request(app.getHttpServer()).get('/api/metrics/flow').expect(500)
    await app.close()
  })

  it('maps a missing table to 503 and closes its pool', async () => {
    const missing = Object.assign(new Error('relation does not exist'), { code: '42P01' })
    let ended = false
    const data = new DatabaseJiraData(
      {
        listProjects: () => Promise.reject(missing),
        listIssues: () => Promise.reject(missing),
        listStatusChanges: () => Promise.resolve([]),
        listSprints: () => Promise.resolve([]),
        listSprintIssues: () => Promise.resolve([]),
      },
      {
        end: () => {
          ended = true
          return Promise.resolve()
        },
      },
    )
    await expect(data.projects()).rejects.toThrow('Jira data is not available yet')
    await expect(data.load('LAB')).rejects.toThrow('Jira data is not available yet')
    const broken = new DatabaseJiraData({
      listProjects: () => Promise.reject(new Error('connection refused')),
      listIssues: () => Promise.resolve([]),
      listStatusChanges: () => Promise.resolve([]),
      listSprints: () => Promise.resolve([]),
      listSprintIssues: () => Promise.resolve([]),
    })
    await expect(broken.projects()).rejects.toThrow('connection refused')
    await data.onModuleDestroy()
    await broken.onModuleDestroy()
    expect(ended).toBe(true)
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('flow metrics on Postgres', () => {
  let db: IsolatedSchema
  let app: INestApplication

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
    const repository = new JiraRepository(db.pool)
    const dataset = flowDataset()
    await repository.upsertSprints(dataset.sprints)
    await repository.upsertIssues(
      dataset.issues.map((issue) => ({ ...issue, sprintId: null, assignee: null })),
    )
    await repository.addStatusChanges(dataset.changes)
    await repository.upsertSprintIssues(dataset.sprintIssues)
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
    })
      .overrideProvider(FLOW_CLOCK)
      .useValue(() => NOW)
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await db.drop()
  })

  it('computes the metrics from the mirror tables', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/metrics/flow?project=LAB')
      .expect(200)
    const body = FlowMetricsResponseSchema.parse(response.body)
    expect(body.cycleTime).toMatchObject({ count: 1, p50: 3 })
    expect(body.blocked.active[0]).toMatchObject({ key: 'LAB-2', blockedDays: 3 })
  })

  it('builds the board from the mirror, sprint membership included', async () => {
    const response = await request(app.getHttpServer()).get('/api/boards/LAB').expect(200)
    const board = BoardResponseSchema.parse(response.body)
    expect(board.sprints.at(-1)).toMatchObject({ name: 'LAB Sprint 2', planned: 1, added: 1 })
    expect((await request(app.getHttpServer()).get('/api/boards').expect(200)).body).toHaveLength(2)
  })
})
