import type { BotSignal, ChecksState, PullRequest } from './types.js'

const BOT_MARKER = '<!-- eng-platform-lab:ai-review -->'
const TASK_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/

const QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state isDraft createdAt mergedAt updatedAt additions deletions
        headRefName baseRefName
        author { login }
        labels(first: 20) { nodes { name } }
        reviewRequests(first: 10) {
          nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
        }
        reviews(first: 50) { nodes { author { login } state submittedAt comments { totalCount } } }
        comments(last: 30) { nodes { author { login } body } }
        timelineItems(itemTypes: [READY_FOR_REVIEW_EVENT], last: 1) {
          nodes { ... on ReadyForReviewEvent { createdAt } }
        }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`

interface RawPullRequest {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  createdAt: string
  mergedAt: string | null
  updatedAt: string
  additions: number
  deletions: number
  headRefName: string
  baseRefName: string
  author: { login: string } | null
  labels: { nodes: { name: string }[] }
  reviewRequests: { nodes: { requestedReviewer: { login?: string; slug?: string } | null }[] }
  reviews: {
    nodes: {
      author: { login: string } | null
      state: string
      submittedAt: string | null
      comments: { totalCount: number }
    }[]
  }
  comments: { nodes: { author: { login: string } | null; body: string }[] }
  timelineItems: { nodes: { createdAt?: string }[] }
  commits: { nodes: { commit: { statusCheckRollup: { state: ChecksState } | null } }[] }
}

interface GraphQlResponse {
  data?: {
    repository: {
      pullRequests: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: RawPullRequest[]
      }
    }
  }
  errors?: { message: string }[]
}

export const isBot = (login: string) => login.endsWith('[bot]') || login === 'github-actions'

export const parseSignal = (body: string): BotSignal => {
  const line = /\*\*Sinal:\*\*\s*(.+)/.exec(body)?.[1] ?? ''
  if (/^Ajustes/i.test(line)) return 'ajustes'
  if (/^(Pendências|Gate)/i.test(line)) return 'gate'
  if (/^Pronto/i.test(line)) return 'pronto'
  return null
}

export const toPullRequest = (raw: RawPullRequest): PullRequest => {
  const botComment = [...raw.comments.nodes].reverse().find((c) => c.body.includes(BOT_MARKER))
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author: raw.author?.login ?? 'desconhecido',
    state: raw.state,
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    readyAt: raw.timelineItems.nodes.at(-1)?.createdAt ?? raw.createdAt,
    mergedAt: raw.mergedAt,
    additions: raw.additions,
    deletions: raw.deletions,
    headRef: raw.headRefName,
    baseRef: raw.baseRefName,
    labels: raw.labels.nodes.map((l) => l.name),
    requestedReviewers: raw.reviewRequests.nodes
      .map((r) => r.requestedReviewer?.login ?? r.requestedReviewer?.slug)
      .filter((name): name is string => Boolean(name)),
    reviews: raw.reviews.nodes
      .filter((r) => r.author && r.submittedAt)
      .map((r) => ({
        author: r.author?.login ?? '',
        state: r.state,
        submittedAt: r.submittedAt ?? '',
        comments: r.comments.totalCount,
      })),
    checks: raw.commits.nodes.at(-1)?.commit.statusCheckRollup?.state ?? null,
    botSignal: botComment ? parseSignal(botComment.body) : null,
    taskKey: TASK_KEY.exec(raw.headRefName)?.[1] ?? TASK_KEY.exec(raw.title)?.[1] ?? null,
  }
}

export interface GitHubOptions {
  token: string
  repository: string
  since: string
  fetchImpl?: typeof fetch
}

/** Lê PRs atualizados desde `since`, do mais recente para o mais antigo, só com leitura. */
export const fetchPullRequests = async (options: GitHubOptions): Promise<PullRequest[]> => {
  const [owner, name] = options.repository.split('/')
  const fetchImpl = options.fetchImpl ?? fetch
  const result: PullRequest[] = []
  let cursor: string | null = null

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { owner, name, cursor } }),
    })
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status}.`)
    const payload = (await response.json()) as GraphQlResponse
    if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join('; '))
    const connection = payload.data?.repository.pullRequests
    if (!connection) break

    let reachedOld = false
    for (const raw of connection.nodes) {
      if (raw.updatedAt < options.since) {
        reachedOld = true
        break
      }
      result.push(toPullRequest(raw))
    }
    if (reachedOld || !connection.pageInfo.hasNextPage) break
    cursor = connection.pageInfo.endCursor
  }
  return result
}
