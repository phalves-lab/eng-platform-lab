import type {
  JiraUnavailableReason,
  MyReviewWork,
  MyWorkResponse,
  TeamMemberLoad,
  WorkAlert,
} from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

const TEAM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLLECT_COMMAND = 'npm run collect:jira -w @lab/portal-worker'

export interface Notice {
  title: string
  description: string
}

/** Why the Jira part of the page is empty and what turns it on. */
export const jiraNotice = (reason: JiraUnavailableReason, login: string): Notice => {
  switch (reason) {
    case 'no_database':
      return {
        title: 'O Jira ainda não está ligado ao portal',
        description: `Suas tasks vêm do espelho do Jira no Postgres. Defina DATABASE_URL na portal-api e rode o coletor (${COLLECT_COMMAND}).`,
      }
    case 'not_collected':
      return {
        title: 'O Jira ainda não foi coletado',
        description: `A portal-api já fala com o banco, mas o espelho está vazio. Rode o coletor (${COLLECT_COMMAND}) e recarregue a página.`,
      }
    case 'unknown_person':
      return {
        title: 'Seu login não está no catálogo de pessoas',
        description: `Inclua ${login} em catalog/people/ com a sua conta do Jira e o seu login do GitHub para ver suas tasks aqui.`,
      }
    case 'no_jira_account':
      return {
        title: 'Sua conta do Jira não está no catálogo',
        description:
          'Preencha o campo jira da sua entrada em catalog/people/ com o nome que aparece como responsável no Jira.',
      }
  }
}

export const reviewNotice = (review: Extract<MyReviewWork, { state: 'unavailable' }>): Notice =>
  review.reason === 'no_github_account'
    ? {
        title: 'Seu login do GitHub não está no catálogo',
        description:
          'Preencha o campo github da sua entrada em catalog/people/ para ver as reviews pedidas e os seus PRs.',
      }
    : {
        title: 'A fila de review ainda não foi coletada',
        description:
          'Rode o coletor de métricas (npm run panel ou o worker) para ver reviews e PRs aqui.',
      }

export interface DaySummary {
  open: number | null
  inReview: number | null
  stale: number | null
  dependsOnMe: number
  alerts: number
}

/** Counts for the top of the page; null where the Jira part is not available. */
export const daySummary = (work: MyWorkResponse): DaySummary => {
  const jira = work.jira.state === 'ready' ? work.jira : null
  const review = work.review.state === 'ready' ? work.review : null
  return {
    open: jira ? jira.inProgress.length + jira.review.length + jira.blocked.length : null,
    inReview: jira ? jira.review.length : null,
    stale: jira ? jira.stale.length : null,
    dependsOnMe:
      (jira?.blockedByMe.length ?? 0) +
      (review?.toReview.length ?? 0) +
      (review?.changesRequested.length ?? 0),
    alerts: work.alerts.length,
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const staleHint = (days: number) =>
  `Sem mudança de status há mais de ${plural(days, 'dia útil', 'dias úteis')}`

export const ALERT_TONE: Record<WorkAlert['severity'], BadgeTone> = {
  alta: 'danger',
  media: 'warning',
}

export const ALERT_LABEL: Record<WorkAlert['kind'], string> = {
  stale_task: 'Parada',
  blocked_task: 'Bloqueada',
  blocking_others: 'Segura alguém',
  late_review: 'Review atrasada',
  failing_checks: 'Check vermelho',
}

/** Load of one person in words, in the same order for everyone and without any score. */
export const describeLoad = (member: TeamMemberLoad): string[] => {
  const parts: string[] = []
  if (member.jira) {
    parts.push(
      `${member.jira.inProgress} em andamento`,
      `${member.jira.review} em review`,
      plural(member.jira.blocked, 'bloqueada', 'bloqueadas'),
      plural(member.jira.stale, 'parada', 'paradas'),
    )
  }
  if (member.pendingReviews !== null) {
    parts.push(plural(member.pendingReviews, 'review pendente', 'reviews pendentes'))
  }
  return parts
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export interface HomeSearch {
  dataset: string | undefined
  team: string | undefined
}

/** Reads `conjunto` and `time` from the page URL, dropping a malformed team id. */
export const parseHomeSearch = (search: {
  conjunto?: string | string[]
  time?: string | string[]
}): HomeSearch => {
  const team = first(search.time)?.trim()
  return {
    dataset: first(search.conjunto)?.trim() || undefined,
    team: team && TEAM_ID.test(team) ? team : undefined,
  }
}

/** Home URL keeping the dataset and the team of the lead view. */
export const homeHref = (search: { dataset?: string; team?: string }) => {
  const params = new URLSearchParams()
  if (search.dataset) params.set('conjunto', search.dataset)
  if (search.team) params.set('time', search.team)
  const text = params.toString()
  return text ? `/?${text}` : '/'
}
