import type {
  ReleaseChecks,
  ReleasePreview,
  ReleaseProject,
  ReleaseSide,
  ReleaseSideFilter,
  ReleaseWarning,
} from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

export const SIDE_LABEL: Record<ReleaseSideFilter, string> = {
  front: 'Front',
  back: 'Back',
  both: 'Os dois',
}

export const CHECKS_LABEL: Record<ReleaseChecks['state'], string> = {
  success: 'Checks verdes',
  failure: 'Checks falhando',
  pending: 'Checks rodando',
  none: 'Sem checks',
}

export const CHECKS_TONE: Record<ReleaseChecks['state'], BadgeTone> = {
  success: 'success',
  failure: 'danger',
  pending: 'info',
  none: 'secondary',
}

export const WARNING_TONE: Record<ReleaseWarning['level'], BadgeTone> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
}

export const WARNING_LABEL: Record<ReleaseWarning['code'], string> = {
  'nothing-new': 'Nada novo',
  'target-ahead': 'Destino à frente',
  conflict: 'Conflito',
  'no-cutoff': 'Sem corte',
  'checks-failing': 'Checks',
  'checks-pending': 'Checks',
  'open-release': 'PR aberta',
}

export interface ReleaseSelection {
  project: ReleaseProject
  side: ReleaseSideFilter
  source: string
  target: string
}

export interface ReleaseSearchParams {
  projeto?: string
  lado?: string
  origem?: string
  destino?: string
}

/** Sides a project declares, in the order the portal shows them. */
export const sidesOf = (project: ReleaseProject): ReleaseSide[] =>
  (['front', 'back'] as const).filter((side) => Boolean(project.repos[side]))

/** Side options for a project: "both" only exists when the project has the two sides. */
export const sideOptions = (project: ReleaseProject): ReleaseSideFilter[] => {
  const sides = sidesOf(project)
  return sides.length > 1 ? [...sides, 'both'] : sides
}

const BRANCH = /^[\w.\-/]{1,200}$/

/** Turns the page query into a valid selection, falling back to the project defaults. */
export const resolveSelection = (
  params: ReleaseSearchParams,
  projects: readonly ReleaseProject[],
): ReleaseSelection | null => {
  const project = projects.find((item) => item.id === params.projeto) ?? projects[0]
  if (!project) return null
  const options = sideOptions(project)
  const side = options.find((option) => option === params.lado) ?? options.at(-1) ?? 'back'
  const branch = (value: string | undefined, fallback: string) =>
    value && BRANCH.test(value) ? value : fallback
  return {
    project,
    side,
    source: branch(params.origem, project.source),
    target: branch(params.destino, project.target),
  }
}

/** Query string for a selection, leaving out what equals the project defaults. */
export const selectionQuery = (selection: {
  project: Pick<ReleaseProject, 'id' | 'source' | 'target'>
  side: ReleaseSideFilter
  source: string
  target: string
}): string => {
  const search = new URLSearchParams({ projeto: selection.project.id, lado: selection.side })
  if (selection.source !== selection.project.source) search.set('origem', selection.source)
  if (selection.target !== selection.project.target) search.set('destino', selection.target)
  return search.toString()
}

/** Branches present in every list, so "both" only offers names that exist on the two sides. */
export const commonBranches = (lists: readonly (readonly string[])[]): string[] => {
  const [first, ...rest] = lists
  if (!first) return []
  return first.filter((branch) => rest.every((list) => list.includes(branch)))
}

/**
 * Totals across the previewed sides for the summary cards. A monorepo declares the same
 * repository on both sides, so PRs and tickets are counted once by URL and key.
 */
export const previewTotals = (preview: ReleasePreview) => {
  const pulls = new Set(
    preview.sides.flatMap((side) => side.tickets.flatMap((t) => t.pulls.map((p) => p.url))),
  )
  const tickets = [
    ...new Map(
      preview.sides
        .flatMap((side) => side.tickets.map((ticket) => ({ side, ticket })))
        .map(({ side, ticket }) => [`${side.repo}:${ticket.key ?? ticket.pulls[0]?.url}`, ticket]),
    ).values(),
  ]
  return {
    pulls: pulls.size,
    tickets: tickets.length,
    multiple: tickets.filter((ticket) => ticket.multiplePulls).length,
    sql: tickets.filter((ticket) => ticket.sql.length > 0).length,
    env: tickets.filter((ticket) => ticket.env.names.length + ticket.env.notes.length > 0).length,
    authors: preview.authors,
  }
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))

/** Short human list: "ana, bruno e mais 3". */
export const shortList = (items: readonly string[], limit = 3) => {
  if (items.length <= limit) return items.join(', ')
  return `${items.slice(0, limit).join(', ')} e mais ${items.length - limit}`
}
