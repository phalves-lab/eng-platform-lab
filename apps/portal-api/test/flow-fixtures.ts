import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import { Test } from '@nestjs/testing'
import type { FlowDataset } from '@lab/flow'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'
import { FLOW_CLOCK } from '../src/flow/flow.service.js'
import { JIRA_DATA, type JiraData } from '../src/flow/jira-data.js'

export const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
export const NOW = new Date('2026-11-20T12:00:00.000Z')

export const flowDataset = (): FlowDataset => ({
  issues: [
    {
      key: 'LAB-1',
      project: 'LAB',
      component: 'Portal',
      issueType: 'Story',
      status: 'Concluído',
      summary: 'Entrega sintética',
      url: 'https://jira.example.test/browse/LAB-1',
      epicKey: 'LAB-9',
      createdAt: '2026-11-01T12:00:00.000Z',
      resolvedAt: '2026-11-18T12:00:00.000Z',
    },
    {
      key: 'LAB-2',
      project: 'LAB',
      component: 'Coletores',
      issueType: 'Task',
      status: 'Bloqueado',
      summary: 'Item bloqueado',
      url: 'https://jira.example.test/browse/LAB-2',
      epicKey: 'LAB-9',
      createdAt: '2026-11-02T12:00:00.000Z',
      resolvedAt: null,
    },
    {
      key: 'LAB-9',
      project: 'LAB',
      component: null,
      issueType: 'Epic',
      status: 'Em andamento',
      summary: 'Épico sintético',
      url: 'https://jira.example.test/browse/LAB-9',
      epicKey: null,
      createdAt: '2026-10-01T12:00:00.000Z',
      resolvedAt: null,
    },
    {
      key: 'OPS-1',
      project: 'OPS',
      component: 'Filas',
      issueType: 'Story',
      status: 'Em execução',
      summary: 'Item de operações',
      url: null,
      epicKey: null,
      createdAt: '2026-11-10T12:00:00.000Z',
      resolvedAt: null,
    },
  ],
  changes: [
    {
      issueKey: 'LAB-1',
      fromStatus: 'A fazer',
      toStatus: 'Em andamento',
      changedAt: '2026-11-15T12:00:00.000Z',
    },
    {
      issueKey: 'LAB-1',
      fromStatus: 'Em andamento',
      toStatus: 'Concluído',
      changedAt: '2026-11-18T12:00:00.000Z',
    },
    {
      issueKey: 'LAB-2',
      fromStatus: 'A fazer',
      toStatus: 'Em andamento',
      changedAt: '2026-11-12T12:00:00.000Z',
    },
    {
      issueKey: 'LAB-2',
      fromStatus: 'Em andamento',
      toStatus: 'Bloqueado',
      changedAt: '2026-11-17T12:00:00.000Z',
    },
    {
      issueKey: 'OPS-1',
      fromStatus: 'A fazer',
      toStatus: 'Em execução',
      changedAt: '2026-11-11T12:00:00.000Z',
    },
  ],
  sprints: [
    {
      id: 1,
      project: 'LAB',
      name: 'LAB Sprint 1',
      state: 'closed',
      startsAt: '2026-11-02T12:00:00.000Z',
      endsAt: '2026-11-16T12:00:00.000Z',
      completedAt: '2026-11-16T12:00:00.000Z',
    },
    {
      id: 2,
      project: 'LAB',
      name: 'LAB Sprint 2',
      state: 'active',
      startsAt: '2026-11-16T12:00:00.000Z',
      endsAt: '2026-11-30T12:00:00.000Z',
      completedAt: null,
    },
  ],
  sprintIssues: [
    { sprintId: 1, issueKey: 'LAB-2', addedAt: '2026-11-02T10:00:00.000Z' },
    { sprintId: 2, issueKey: 'LAB-1', addedAt: '2026-11-15T12:00:00.000Z' },
    { sprintId: 2, issueKey: 'LAB-2', addedAt: '2026-11-17T12:00:00.000Z' },
  ],
})

export const fakeData = (dataset: FlowDataset): JiraData => ({
  projects: () => Promise.resolve([...new Set(dataset.issues.map((issue) => issue.project))]),
  load: (project) =>
    Promise.resolve(
      project
        ? {
            ...dataset,
            issues: dataset.issues.filter((issue) => issue.project === project),
            sprints: dataset.sprints.filter((sprint) => sprint.project === project),
          }
        : dataset,
    ),
})

export const startFlowApp = async (data: JiraData | null, env: Record<string, string> = {}) => {
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(
        loadConfig({
          NODE_ENV: 'test',
          PORTAL_HANDBOOK_DIR: HANDBOOK,
          PORTAL_PANEL_DATA: '/nonexistent/data.json',
          ...env,
        }),
      ),
    ],
  })
    .overrideProvider(JIRA_DATA)
    .useValue(data)
    .overrideProvider(FLOW_CLOCK)
    .useValue(() => NOW)
    .compile()
  const app = module.createNestApplication()
  await app.init()
  return app
}
