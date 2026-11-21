import type { CheckStatus, DocReviewStatus, ScoreLevel } from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

export const SCORE_LEVELS: ScoreLevel[] = ['good', 'attention', 'critical', 'unknown']

export const SCORE_LEVEL_LABEL: Record<ScoreLevel, string> = {
  good: 'Bom',
  attention: 'Atenção',
  critical: 'Crítico',
  unknown: 'Sem nota',
}

export const SCORE_LEVEL_TONE: Record<ScoreLevel, BadgeTone> = {
  good: 'success',
  attention: 'warning',
  critical: 'danger',
  unknown: 'secondary',
}

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Atende',
  partial: 'Parcial',
  fail: 'Não atende',
  unknown: 'Sem leitura',
}

export const CHECK_STATUS_TONE: Record<CheckStatus, BadgeTone> = {
  pass: 'success',
  partial: 'warning',
  fail: 'danger',
  unknown: 'secondary',
}

export const DOC_STATUSES: DocReviewStatus[] = ['stale', 'missing', 'expiring', 'ok']

export const DOC_STATUS_LABEL: Record<DocReviewStatus, string> = {
  ok: 'Em dia',
  expiring: 'Vence em breve',
  stale: 'Vencido',
  missing: 'Sem dono ou data',
}

export const DOC_STATUS_TONE: Record<DocReviewStatus, BadgeTone> = {
  ok: 'success',
  expiring: 'warning',
  stale: 'danger',
  missing: 'secondary',
}

/** Indicator color of a score bar, matching the level thresholds of the default policy. */
export const SCORE_BAR: Record<ScoreLevel, string> = {
  good: '[&>[data-slot=progress-indicator]]:bg-success',
  attention: '[&>[data-slot=progress-indicator]]:bg-warning',
  critical: '[&>[data-slot=progress-indicator]]:bg-destructive',
  unknown: '[&>[data-slot=progress-indicator]]:bg-muted-foreground',
}

export const isScoreLevel = (value: string | undefined): value is ScoreLevel =>
  SCORE_LEVELS.some((level) => level === value)

export const isDocStatus = (value: string | undefined): value is DocReviewStatus =>
  DOC_STATUSES.some((status) => status === value)

export const formatScore = (score: number | null) => (score === null ? 'sem nota' : `${score}`)

export const formatOwner = (owner: string | null) => owner ?? 'Sem dono'

export const formatAge = (days: number | null) => {
  if (days === null) return 'sem data'
  if (days <= 0) return 'hoje'
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

export const formatMonths = (months: number) => (months === 1 ? '1 mês' : `${months} meses`)

/** Checks that still need work, worst first, so the repository page opens on what to fix. */
export const byUrgency = <T extends { status: CheckStatus; weight: number }>(checks: T[]): T[] => {
  const order: CheckStatus[] = ['fail', 'partial', 'unknown', 'pass']
  return [...checks].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.weight - a.weight,
  )
}

export const pendingChecks = (checks: { status: CheckStatus }[]) =>
  checks.filter((check) => check.status === 'fail' || check.status === 'partial').length

const SUMMARY: Record<DocReviewStatus, [string, string]> = {
  stale: ['vencido', 'vencidos'],
  missing: ['sem dono ou data', 'sem dono ou data'],
  expiring: ['vencendo', 'vencendo'],
  ok: ['em dia', 'em dia'],
}

/** One-line summary of an owner group, most urgent first, skipping empty statuses. */
export const ownerSummary = (counts: Record<DocReviewStatus, number>) => {
  const parts = DOC_STATUSES.filter((status) => counts[status] > 0).map(
    (status) => `${counts[status]} ${SUMMARY[status][counts[status] === 1 ? 0 : 1]}`,
  )
  if (!parts.length) return 'Nenhum item.'
  const last = parts.pop() ?? ''
  const head = parts.join(', ')
  return head ? `${head} e ${last}.` : `${last}.`
}

export const pendingLabel = (pending: number) => {
  if (!pending) return 'Nenhuma checagem pendente.'
  return pending === 1 ? '1 checagem pede ação.' : `${pending} checagens pedem ação.`
}
