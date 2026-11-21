import type { BoardSummary, CfdPoint, FlowCategory, SprintSummary } from '@lab/contracts'
import { formatWeek } from '@/lib/delivery'

/** Stacking order of the cumulative flow: finished work at the bottom, backlog on top. */
export const CFD_ORDER: FlowCategory[] = ['done', 'review', 'blocked', 'in_progress', 'todo']

const PROJECT_KEY = /^[A-Z][A-Z0-9]+$/

/** Requested project when the mirror has it, otherwise the first board listed. */
export const resolveBoard = (
  requested: string | string[] | undefined,
  boards: Pick<BoardSummary, 'project'>[],
): string | null => {
  const value = (Array.isArray(requested) ? requested[0] : requested)?.trim().toUpperCase()
  const known = boards.map((board) => board.project)
  if (value && PROJECT_KEY.test(value) && known.includes(value)) return value
  return known[0] ?? null
}

export type CfdDatum = Omit<CfdPoint, 'day'> & { day: string }

export const cfdSeries = (cfd: CfdPoint[]): CfdDatum[] =>
  cfd.map((point) => ({ ...point, day: formatWeek(`${point.day}T00:00:00.000Z`) }))

export interface SprintDatum {
  sprint: string
  planned: number
  added: number
  delivered: number
}

/** Sprint name without the project prefix Jira boards usually add, to fit the chart axis. */
const shortSprintName = (name: string, project: string) =>
  name.startsWith(`${project} `) ? name.slice(project.length + 1) : name

export const sprintSeries = (sprints: SprintSummary[], project: string): SprintDatum[] =>
  sprints.map((sprint) => ({
    sprint: `${shortSprintName(sprint.name, project)}${sprint.state === 'active' ? ' (ativa)' : ''}`,
    planned: sprint.planned,
    added: sprint.added,
    delivered: sprint.delivered,
  }))

/** One line per sprint for readers who skip the chart, such as screen readers and phones. */
export const sprintSentence = (sprint: SprintSummary) => {
  const delivered = `${sprint.deliveredPlanned} de ${sprint.planned} previstos entregues`
  const added =
    sprint.added === 0
      ? 'nada entrou depois do início'
      : `${sprint.added} ${sprint.added === 1 ? 'item entrou' : 'itens entraram'} depois do início`
  return `${delivered}; ${added}; ${sprint.delivered} entregues no total.`
}

export const formatEpicProgress = (done: number, total: number) =>
  total === 0 ? 'Sem itens ligados' : `${done} de ${total} concluídos`
