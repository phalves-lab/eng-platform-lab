/**
 * Contrato do `data.json` que o coletor publica e o app do painel lê. Só tipos, sem código:
 * o app importa daqui para os dois lados nunca divergirem.
 */
export type ChecksState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | 'EXPECTED' | null
export type BotSignal = 'ajustes' | 'gate' | 'pronto' | null
export type QueueLevel = 'ok' | 'atencao' | 'atrasado'
export type AlertSeverity = 'alta' | 'media'

export interface QueueRow {
  position: number
  number: number
  title: string
  url: string
  author: string
  taskKey: string | null
  taskStatus: string | null
  requestedReviewers: string[]
  enteredAt: string
  enteredFrom: 'jira' | 'pr'
  ageBusinessDays: number
  level: QueueLevel
  hasHumanReview: boolean
  checks: ChecksState
  botSignal: BotSignal
  risks: string[]
  lines: number
}

export interface Alert {
  kind: string
  severity: AlertSeverity
  subject: string
  message: string
  url: string | null
}

export interface ReviewerLoad {
  reviewer: string
  reviews: number
  pullRequests: number
  comments: number
}

export interface ReviewPair {
  author: string
  reviewer: string
  count: number
}

export interface TeamMetrics {
  windowDays: number
  merged: number
  medianHoursToFirstReview: number | null
  medianBusinessDaysToMerge: number | null
  medianSize: number | null
  mergedWithFailingChecks: number
  signals: Record<Exclude<BotSignal, null> | 'sem_comentario', number>
  reviewers: ReviewerLoad[]
  pairs: ReviewPair[]
}

export interface WeeklyPoint {
  weekStart: string
  merged: number
  medianHoursToFirstReview: number | null
  medianSize: number | null
}

export interface PanelDataset {
  id: string
  title: string
  label: string
  generatedAt: string
  queue: QueueRow[]
  alerts: Alert[]
  metrics: TeamMetrics
  trend: WeeklyPoint[]
}

export interface PanelData {
  schemaVersion: 1
  generatedAt: string
  datasets: PanelDataset[]
}
