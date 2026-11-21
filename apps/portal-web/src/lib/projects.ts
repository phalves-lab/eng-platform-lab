import type {
  FlowCategory,
  ProjectDecision,
  ProjectEpic,
  ProjectRiskSeverity,
  ProjectSourceState,
  ProjectStatus,
  SystemEvent,
} from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planejado', tone: 'secondary' },
  active: { label: 'Em andamento', tone: 'info' },
  at_risk: { label: 'Em risco', tone: 'danger' },
  paused: { label: 'Pausado', tone: 'warning' },
  done: { label: 'Concluído', tone: 'success' },
}

export const RISK_SEVERITY: Record<ProjectRiskSeverity, { label: string; tone: BadgeTone }> = {
  high: { label: 'Alta', tone: 'danger' },
  medium: { label: 'Média', tone: 'warning' },
  low: { label: 'Baixa', tone: 'secondary' },
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** One line about the epic that also explains why there is no progress to show. */
export const epicSentence = (
  epicKey: string | null,
  epic: ProjectEpic | null,
  jira: ProjectSourceState,
) => {
  if (!epicKey) return 'Sem épico cadastrado no catálogo.'
  if (jira === 'unavailable') return `Espelho do Jira indisponível para ${epicKey}.`
  if (!epic) return `O épico ${epicKey} ainda não está no espelho do Jira.`
  if (epic.total === 0) return `${epicKey} ainda não tem itens ligados.`
  return `${epic.done} de ${epic.total} concluídos · ${plural(epic.open, 'aberto', 'abertos')} · ${plural(epic.blocked, 'bloqueado', 'bloqueados')}`
}

export const openPullRequestsLabel = (count: number | null) =>
  count === null ? 'Fila de review indisponível' : plural(count, 'PR aberto', 'PRs abertos')

/** Portal page of a linked decision: the standard page, the decisions list or none. */
export const decisionHref = (decision: Pick<ProjectDecision, 'id' | 'kind'>): string | null => {
  switch (decision.kind) {
    case 'standard':
      return `/padroes/${encodeURIComponent(decision.id)}`
    case 'decision':
      return '/decisoes'
    case 'unknown':
      return null
  }
}

/** Searches the projects list by term, ignoring a blank or repeated query parameter. */
export const parseProjectTerm = (term: string | string[] | undefined) => {
  const value = (Array.isArray(term) ? term[0] : term)?.trim() ?? ''
  return value.length ? value.slice(0, 80) : undefined
}

/** Topic and event in the `topic › event` form used on the system card. */
export const eventLabel = (event: Pick<SystemEvent, 'topic' | 'event'>) =>
  `${event.topic} › ${event.event}`

export const CATEGORY_TONE: Record<FlowCategory, BadgeTone> = {
  todo: 'secondary',
  in_progress: 'info',
  review: 'warning',
  blocked: 'danger',
  done: 'success',
}
