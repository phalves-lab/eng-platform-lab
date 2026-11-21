import {
  BoardProjectParamSchema,
  type DatasetId,
  DatasetIdSchema,
  type DoraMetricsResponse,
  type DoraQuery,
  DoraQuerySchema,
  type FlowMetricsQuery,
  type FlowMetricsResponse,
  type ReviewMetricsResponse,
} from '@lab/contracts'
import { z } from 'zod'
import { type ChatTool, defineTool, textOutput } from './chat-tool.js'
import { type TaskFixture, TaskKeySchema } from './task-fixtures.js'

export const PORTAL_TOOL_NAMES = [
  'metricas_review',
  'metricas_fluxo',
  'metricas_dora',
  'tarefa',
] as const
export type PortalToolName = (typeof PORTAL_TOOL_NAMES)[number]

/** Read-only sources behind the portal tools: the same services that serve the metric routes. */
export interface PortalReaders {
  review: (dataset: DatasetId) => Promise<Omit<ReviewMetricsResponse, 'dataset'>>
  flow: (query: FlowMetricsQuery) => Promise<FlowMetricsResponse>
  dora: (query: DoraQuery) => Promise<DoraMetricsResponse>
  task: (key: string) => Promise<TaskFixture | null>
}

const MAX_ITEMS = 10
const weeks = z.number().int().min(4).max(26).optional()

const json = (value: unknown) => textOutput(JSON.stringify(value))

/**
 * Team review numbers without the per-person load and pairs, so a summary cannot turn into a
 * ranking of people.
 */
const reviewSummary = (data: Omit<ReviewMetricsResponse, 'dataset'>, dataset: DatasetId) => {
  const { metrics } = data
  return {
    conjunto: dataset,
    titulo: data.title,
    geradoEm: data.generatedAt,
    metricas: {
      windowDays: metrics.windowDays,
      merged: metrics.merged,
      medianHoursToFirstReview: metrics.medianHoursToFirstReview,
      medianBusinessDaysToMerge: metrics.medianBusinessDaysToMerge,
      medianSize: metrics.medianSize,
      mergedWithFailingChecks: metrics.mergedWithFailingChecks,
      signals: metrics.signals,
    },
    semanas: data.trend.slice(-4),
    alertas: data.alerts
      .slice(0, MAX_ITEMS)
      .map(({ kind, severity, message }) => ({ kind, severity, message })),
    totalDeAlertas: data.alerts.length,
  }
}

const flowSummary = (data: FlowMetricsResponse) => ({
  geradoEm: data.generatedAt,
  filtro: data.filter,
  entregasPorSemana: data.throughput,
  tempoDeCicloDias: {
    count: data.cycleTime.count,
    p50: data.cycleTime.p50,
    p85: data.cycleTime.p85,
    p95: data.cycleTime.p95,
  },
  leadTimeDias: data.leadTime,
  wip: data.wip,
  envelhecendo: data.aging
    .filter((item) => item.level !== 'ok')
    .slice(0, MAX_ITEMS)
    .map(({ key, summary, ageDays, level }) => ({ key, summary, ageDays, level })),
  bloqueados: data.blocked.active
    .slice(0, MAX_ITEMS)
    .map(({ key, summary, blockedDays }) => ({ key, summary, blockedDays })),
  diasBloqueadosNaJanela: data.blocked.blockedDaysInWindow,
})

const doraSummary = (data: DoraMetricsResponse) => ({
  geradoEm: data.generatedAt,
  janela: data.window,
  filtro: data.filter,
  resumo: data.summary,
  semanas: data.trend.slice(-4),
  times: data.teams.map(({ team, repos, summary }) => ({ team, repos, summary })),
  incidentes: data.incidents.map(({ id, title, severity, startedAt, endedAt }) => ({
    id,
    title,
    severity,
    startedAt,
    endedAt,
  })),
})

const taskText = (task: TaskFixture) =>
  [
    `${task.key} · ${task.title}`,
    task.status ? `Status: ${task.status}` : null,
    task.area ? `Área: ${task.area}` : null,
    task.epic ? `Épico: ${task.epic}` : null,
    task.labels.length ? `Rótulos: ${task.labels.join(', ')}` : null,
    '',
    `Descrição: ${task.description}`,
    '',
    task.acceptanceCriteria.length
      ? ['Critérios de aceite:', ...task.acceptanceCriteria.map((item) => '- ' + item)].join('\n')
      : 'Critérios de aceite: nenhum cadastrado.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

/** Tools for the draft modes: metrics already exposed by the API and the synthetic tasks. */
export const createPortalTools = (readers: PortalReaders): Record<PortalToolName, ChatTool> => ({
  metricas_review: defineTool({
    name: 'metricas_review',
    description:
      'Métricas de review do time na janela do coletor: PRs mergeados, mediana até o primeiro review e até o merge, tamanho, sinais do bot, série semanal e alertas.',
    input: z.object({
      conjunto: DatasetIdSchema.default('lab').describe('Conjunto de dados: lab ou demo'),
    }),
    run: async ({ conjunto }) => json(reviewSummary(await readers.review(conjunto), conjunto)),
  }),
  metricas_fluxo: defineTool({
    name: 'metricas_fluxo',
    description:
      'Métricas de fluxo do espelho do Jira: entregas por semana, tempo de ciclo e lead time em dias, WIP, itens envelhecendo e bloqueados.',
    input: z.object({
      projeto: BoardProjectParamSchema.optional().describe('Chave do projeto, como LAB'),
      componente: z.string().trim().min(1).max(80).optional(),
      semanas: weeks.describe('Janela em semanas, de 4 a 26; padrão 4'),
    }),
    run: async ({ projeto, componente, semanas }) =>
      json(
        flowSummary(
          await readers.flow({
            weeks: semanas ?? 4,
            ...(projeto ? { project: projeto } : {}),
            ...(componente ? { component: componente } : {}),
          }),
        ),
      ),
  }),
  metricas_dora: defineTool({
    name: 'metricas_dora',
    description:
      'Métricas DORA por time ou repositório: frequência de deploy, lead time, taxa de falha de mudança e tempo de restauração, com a faixa de cada uma.',
    input: z.object({
      time: z.string().trim().min(1).max(64).optional(),
      repositorio: z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/)
        .optional()
        .describe('Repositório no formato dono/nome'),
      semanas: weeks.describe('Janela em semanas, de 4 a 26; padrão 4'),
    }),
    run: async ({ time, repositorio, semanas }) => {
      const query = DoraQuerySchema.safeParse({
        team: time,
        repo: repositorio,
        weeks: semanas ?? 4,
      })
      if (!query.success) return textOutput('Use time ou repositório, não os dois.')
      return json(doraSummary(await readers.dora(query.data)))
    },
  }),
  tarefa: defineTool({
    name: 'tarefa',
    description:
      'Texto de uma task de exemplo pela chave (ex.: LAB-53): título, status, descrição e critérios de aceite.',
    input: z.object({ chave: TaskKeySchema.describe('Chave da task, como LAB-53') }),
    run: async ({ chave }) => {
      const task = await readers.task(chave)
      return textOutput(
        task ? taskText(task) : `Task ${chave} não encontrada. Peça para a pessoa colar o texto.`,
      )
    },
  }),
})
