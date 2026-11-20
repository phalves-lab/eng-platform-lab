export type ChecksState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | 'EXPECTED' | null
export type BotSignal = 'ajustes' | 'gate' | 'pronto' | null

export interface Review {
  author: string
  state: string
  submittedAt: string
  comments: number
}

export interface PullRequest {
  number: number
  title: string
  url: string
  author: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  createdAt: string
  readyAt: string
  mergedAt: string | null
  additions: number
  deletions: number
  headRef: string
  baseRef: string
  labels: string[]
  requestedReviewers: string[]
  reviews: Review[]
  checks: ChecksState
  botSignal: BotSignal
  taskKey: string | null
}

export interface StatusChange {
  status: string
  at: string
}

export interface TaskStatus {
  key: string
  title: string
  status: string
  acceptanceCriteria: number
  statusHistory: StatusChange[]
}

export interface Dataset {
  label: string
  generatedAt: string
  pullRequests: PullRequest[]
  tasks: TaskStatus[]
}
