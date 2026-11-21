import type {
  ReleaseChecks,
  ReleaseCutoff,
  ReleaseDeployOrder,
  ReleaseEnv,
  ReleaseOpenPull,
  ReleaseProject,
  ReleaseSide,
  ReleaseTicket,
  ReleaseWarning,
} from '@lab/contracts'
import type { GitHubCheckRun, GitHubCompare, GitHubPull, GitHubTag } from './github.js'

const TICKET = /\b([A-Z][A-Z0-9]+-\d+)\b/
const TASK_LINE = /\*\*Task:\*\*\s*\[?([A-Z][A-Z0-9]+-\d+)/
const SQL_BLOCK = /```sql[^\n]*\n([\s\S]*?)```/gi
const HTML_COMMENT = /<!--[\s\S]*?-->/g
const NOT_APPLICABLE =
  /^(?:n\/?a|não se aplica|nao se aplica|não aplicável|nao aplicavel|nenhum|nenhuma|sem alteraç(?:ão|ões)|-+)\.?$/i
const ENV_NAME = /`([A-Z][A-Z0-9_]*[A-Z0-9])`|\b([A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9])\b/g
const CONVENTIONAL_PREFIX = /^[a-z]+(?:\([^)]*\))?!?:\s*/i
const SUMMARY_LIMIT = 280

const isNotApplicable = (text: string) =>
  NOT_APPLICABLE.test(
    text
      .replace(/^[-*>\s]+/, '')
      .replace(/^--\s*/, '')
      .trim(),
  )

/** Ticket key of a pull request: branch name first, then title, then the template Task line. */
export const ticketKeyOf = (pull: Pick<GitHubPull, 'headRef' | 'title' | 'body'>): string | null =>
  TICKET.exec(pull.headRef)?.[1] ??
  TICKET.exec(pull.title)?.[1] ??
  TASK_LINE.exec(pull.body)?.[1] ??
  null

/** Markdown section body under a `##` heading whose title matches, without HTML comments. */
export const sectionOf = (body: string, heading: RegExp): string | null => {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(
    (line) => /^#{2,3}\s/.test(line) && heading.test(line.replace(/^#+\s*/, '')),
  )
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^#{1,3}\s/.test(line))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').replace(HTML_COMMENT, '').trim()
}

/**
 * SQL blocks with real statements. A block that only holds SQL comments, blank lines or a
 * "not applicable" marker, like the template placeholder, does not count.
 */
export const extractSql = (body: string): string[] =>
  [...body.matchAll(SQL_BLOCK)]
    .map((match) => (match[1] ?? '').trim())
    .filter((sql) => {
      const statements = sql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('--'))
      return statements.length > 0 && !statements.every(isNotApplicable)
    })

/** Environment variables named in the ENV section, plus its meaningful lines. */
export const extractEnv = (body: string): ReleaseEnv => {
  const section = sectionOf(body, /^env\b/i)
  if (!section) return { names: [], notes: [] }
  const notes = section
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line && !line.startsWith('```') && !isNotApplicable(line))
  const names = new Set<string>()
  for (const note of notes)
    for (const match of note.matchAll(ENV_NAME)) names.add(match[1] ?? match[2] ?? '')
  names.delete('')
  return { names: [...names], notes }
}

/** First paragraph of the business context or description section, trimmed for a preview. */
export const extractSummary = (body: string): string | null => {
  const section = sectionOf(body, /^(contexto|descri)/i)
  const paragraph = section
    ?.split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, ' ')
    .trim()
  if (!paragraph || isNotApplicable(paragraph)) return null
  return paragraph.length > SUMMARY_LIMIT
    ? `${paragraph.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…`
    : paragraph
}

const isBot = (login: string) => login.endsWith('[bot]') || login === 'github-actions'

/** Distinct human authors in first-seen order; bots never become release assignees. */
export const unionAuthors = (logins: readonly string[]): string[] => [
  ...new Set(logins.filter((login) => login && !isBot(login))),
]

const byMergedAt = (a: GitHubPull, b: GitHubPull) =>
  (a.mergedAt ?? '').localeCompare(b.mergedAt ?? '')

const releasePrefix = (pattern: string) => pattern.slice(0, pattern.search(/\{|$/))

/**
 * Last release cut for `source → target`: the newest merged PR into the target that carries the
 * release label and came from the source (or from a release branch). Falls back to the newest tag.
 */
export const findCutoff = (
  project: Pick<ReleaseProject, 'labels' | 'releaseBranch'>,
  source: string,
  mergedIntoTarget: readonly GitHubPull[],
  tags: readonly GitHubTag[],
): ReleaseCutoff => {
  const prefix = releasePrefix(project.releaseBranch)
  const release = mergedIntoTarget
    .filter(
      (pull) =>
        pull.mergedAt &&
        pull.labels.includes(project.labels.release) &&
        (pull.headRef === source || pull.headRef.startsWith(prefix)),
    )
    .sort(byMergedAt)
    .at(-1)
  if (release?.mergedAt) {
    return { kind: 'release-pr', ref: `#${release.number}`, at: release.mergedAt, url: release.url }
  }
  const tag = tags
    .filter((candidate) => candidate.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .at(-1)
  if (tag?.date) return { kind: 'tag', ref: tag.name, at: tag.date, url: tag.url }
  return { kind: 'none', ref: null, at: null, url: null }
}

const ticketTitle = (pull: GitHubPull, key: string | null) => {
  const title = pull.title.replace(CONVENTIONAL_PREFIX, '').trim()
  const withoutKey = key ? title.replace(new RegExp(`\\(?\\b${key}\\b\\)?[:\\s-]*`), '').trim() : ''
  return withoutKey || title
}

/**
 * Groups merged PRs by ticket, in the merge order of each ticket's first PR. PRs without a ticket
 * stay on their own. SQL blocks add up and ENV variables are deduplicated by name.
 */
export const groupByTicket = (
  pulls: readonly GitHubPull[],
  ticketUrl?: string,
): ReleaseTicket[] => {
  const groups = new Map<string, { key: string | null; pulls: GitHubPull[] }>()
  for (const pull of [...pulls].sort(byMergedAt)) {
    const key = ticketKeyOf(pull)
    const id = key ?? `#${pull.number}`
    const group = groups.get(id) ?? { key, pulls: [] }
    group.pulls.push(pull)
    groups.set(id, group)
  }
  return [...groups.values()].map(({ key, pulls: group }) => {
    const env = group.map((pull) => extractEnv(pull.body))
    const first = group[0] as GitHubPull
    return {
      key,
      title: ticketTitle(first, key),
      url: key && ticketUrl ? ticketUrl.replace('{key}', key) : null,
      summary: group.map((pull) => extractSummary(pull.body)).find(Boolean) ?? null,
      pulls: group.map((pull) => ({
        number: pull.number,
        title: pull.title,
        url: pull.url,
        author: pull.author,
        mergedAt: pull.mergedAt ?? '',
      })),
      authors: unionAuthors(group.map((pull) => pull.author)),
      sql: group.flatMap((pull) => extractSql(pull.body)),
      env: {
        names: [...new Set(env.flatMap((item) => item.names))],
        notes: [...new Set(env.flatMap((item) => item.notes))],
      },
      multiplePulls: group.length > 1,
    }
  })
}

const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'])

/** Collapses the head check runs into one state; any failure wins over pending runs. */
export const summarizeChecks = (runs: readonly GitHubCheckRun[]): ReleaseChecks => {
  const failed = runs.filter((run) => run.conclusion && FAILED.has(run.conclusion))
  const pending = runs.filter((run) => run.status !== 'completed').length
  let state: ReleaseChecks['state'] = 'success'
  if (!runs.length) state = 'none'
  else if (failed.length) state = 'failure'
  else if (pending) state = 'pending'
  return { state, total: runs.length, failed: failed.map((run) => run.name), pending }
}

/** Open release PR into the target: from the source itself, a release branch or with the label. */
export const findOpenRelease = (
  project: Pick<ReleaseProject, 'labels' | 'releaseBranch'>,
  source: string,
  openIntoTarget: readonly GitHubPull[],
): Omit<ReleaseOpenPull, 'mergeable'> | null => {
  const prefix = releasePrefix(project.releaseBranch)
  const found = openIntoTarget.find(
    (pull) =>
      pull.headRef === source ||
      pull.headRef.startsWith(prefix) ||
      pull.labels.includes(project.labels.release),
  )
  return found
    ? { number: found.number, title: found.title, url: found.url, head: found.headRef }
    : null
}

interface WarningInput {
  source: string
  target: string
  compare: GitHubCompare
  pulls: number
  cutoff: ReleaseCutoff
  checks: ReleaseChecks
  openRelease: ReleaseOpenPull | null
}

/** Signals that should stop or slow down a release before anyone opens it. */
export const buildWarnings = (input: WarningInput): ReleaseWarning[] => {
  const warnings: ReleaseWarning[] = []
  const { source, target, compare } = input
  if (compare.aheadBy === 0 || input.pulls === 0) {
    warnings.push({
      code: 'nothing-new',
      level: 'warning',
      message:
        compare.aheadBy === 0
          ? `${source} não tem nada que ${target} ainda não tenha.`
          : `${source} está ${compare.aheadBy} commit(s) à frente, mas nenhum PR foi mergeado desde o corte.`,
    })
  }
  if (compare.behindBy > 0) {
    warnings.push({
      code: 'target-ahead',
      level: 'warning',
      message: `${target} tem ${compare.behindBy} commit(s) que ${source} não tem. Confira se algum hotfix não voltou para ${source}.`,
    })
  }
  if (input.openRelease?.mergeable === false) {
    warnings.push({
      code: 'conflict',
      level: 'danger',
      message: `A PR de release #${input.openRelease.number} tem conflito com ${target}.`,
    })
  }
  if (input.openRelease) {
    warnings.push({
      code: 'open-release',
      level: 'info',
      message: `Já existe a PR de release #${input.openRelease.number} aberta; a próxima geração atualiza essa PR.`,
    })
  }
  if (input.cutoff.kind === 'none') {
    warnings.push({
      code: 'no-cutoff',
      level: 'info',
      message: `Nenhuma release anterior nem tag encontrada; a prévia lista os PRs mais recentes de ${source}.`,
    })
  }
  if (input.checks.state === 'failure') {
    warnings.push({
      code: 'checks-failing',
      level: 'danger',
      message: `Checks falhando no head de ${source}: ${input.checks.failed.join(', ')}.`,
    })
  } else if (input.checks.state === 'pending') {
    warnings.push({
      code: 'checks-pending',
      level: 'info',
      message: `${input.checks.pending} check(s) ainda rodando no head de ${source}.`,
    })
  }
  return warnings
}

/** Deploy order for a two-sided release: the back goes first when it carries a migration. */
export const deployOrder = (
  project: Pick<ReleaseProject, 'deploy'>,
  backTickets: readonly ReleaseTicket[],
): ReleaseDeployOrder => {
  const hasMigration = backTickets.some((ticket) => ticket.sql.length > 0)
  if (project.deploy.backFirstOnMigration && hasMigration) {
    return { sides: ['back', 'front'] satisfies ReleaseSide[], reason: 'migration' }
  }
  return { sides: [...project.deploy.order], reason: 'config' }
}

/** Fills `{yyyy}`, `{mm}` and `{dd}` with the date as seen in São Paulo. */
export const renderReleaseBranch = (pattern: string, date: Date): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  return pattern
    .replaceAll('{yyyy}', parts['year'] ?? '')
    .replaceAll('{mm}', parts['month'] ?? '')
    .replaceAll('{dd}', parts['day'] ?? '')
}
