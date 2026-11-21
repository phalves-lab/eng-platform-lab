import type {
  ProjectDetail,
  ProjectRiskSeverity,
  ProjectStatus,
  ProjectSystem,
} from '@lab/contracts'
import type { Citation } from '@lab/handbook'
import { z } from 'zod'
import type { ChatTool } from '../ask/chat-tools.js'
import type { ProjectsService } from './projects.service.js'

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'planejado',
  active: 'em andamento',
  at_risk: 'em risco',
  paused: 'pausado',
  done: 'concluído',
}

const SEVERITY_LABEL: Record<ProjectRiskSeverity, string> = {
  high: 'alta',
  medium: 'média',
  low: 'baixa',
}

const Input = z.object({
  projeto: z.string().min(2).describe('Id ou nome do projeto, como metricas-de-fluxo'),
})

const epicLine = (project: ProjectDetail) => {
  if (!project.epicKey) return 'Épico: nenhum cadastrado.'
  if (project.sources.jira === 'unavailable') {
    return `Épico ${project.epicKey}: espelho do Jira indisponível.`
  }
  const epic = project.epic
  if (!epic) return `Épico ${project.epicKey}: não está no espelho do Jira.`
  const percent = epic.percent === null ? '' : ` (${epic.percent}%)`
  return `Épico ${epic.key}: ${epic.done} de ${epic.total} itens concluídos${percent}, ${epic.open} abertos, ${epic.blocked} bloqueados.`
}

const deliveryLines = (project: ProjectDetail) => {
  const prs =
    project.sources.pullRequests === 'unavailable'
      ? 'PRs abertos: fila de review indisponível.'
      : `PRs abertos: ${project.pullRequests.open.length}.`
  if (project.sources.dora === 'unavailable')
    return [prs, 'Deploys e PRs mergeados: indisponíveis.']
  const failed = project.deploys.filter((deploy) => deploy.failed).length
  return [
    prs,
    `PRs mergeados nas últimas ${project.windowWeeks} semanas: ${project.pullRequests.merged.length}.`,
    `Deploys em produção nas últimas ${project.windowWeeks} semanas: ${project.deploys.length} (${failed} com falha).`,
  ]
}

const systemName = (system: ProjectSystem) =>
  system.slug ? system.name : `${system.name} (sem ficha)`

const describe = (project: ProjectDetail, source: string) =>
  [
    `${project.name} (${project.id}), ${PROJECT_STATUS_LABEL[project.status]}`,
    `Objetivo: ${project.objective}`,
    `Dono: ${project.owner}`,
    epicLine(project),
    ...deliveryLines(project),
    `Sistemas: ${project.systems.map(systemName).join(', ') || 'nenhum'}`,
    `Decisões ligadas: ${
      project.decisions
        .map((decision) => (decision.title ? `${decision.id} (${decision.title})` : decision.id))
        .join(', ') || 'nenhuma'
    }`,
    ...(project.risks.length
      ? project.risks.map((risk) => `Risco ${SEVERITY_LABEL[risk.severity]}: ${risk.title}`)
      : ['Riscos: nenhum cadastrado']),
    '',
    `Fonte: ${source}`,
  ].join('\n')

const citations = (project: ProjectDetail, source: string): Citation[] => [
  { kind: 'passage', ref: source, label: project.name, source },
  ...project.systems.flatMap((system): Citation[] =>
    system.slug ? [{ kind: 'system', ref: system.slug, label: system.name, source }] : [],
  ),
  ...project.decisions.flatMap((decision): Citation[] =>
    decision.kind === 'standard'
      ? [
          {
            kind: 'standard',
            ref: decision.id,
            label: `${decision.id} · ${decision.title ?? ''}`,
            source,
          },
        ]
      : [],
  ),
]

/** Chat tool that answers how a project is going, crossing the catalog with the portal data. */
export const createProjectTool = (projects: ProjectsService): ChatTool => ({
  name: 'projeto',
  description:
    'Situação de um projeto do catálogo: objetivo, status, dono, progresso do épico no Jira, PRs abertos e mergeados, deploys, sistemas, decisões e riscos ligados.',
  input: Input,
  execute: async (args) => {
    const { projeto } = Input.parse(args)
    const found = projects.find(projeto)
    if (!found) {
      return {
        text: `Projeto "${projeto}" não encontrado. Projetos do catálogo: ${projects.names().join(', ') || 'nenhum'}.`,
        citations: [],
      }
    }
    const detail = await projects.detail(found.entry.id)
    return { text: describe(detail, found.source), citations: citations(detail, found.source) }
  },
})
