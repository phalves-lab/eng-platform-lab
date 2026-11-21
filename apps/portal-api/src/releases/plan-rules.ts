import { createHash } from 'node:crypto'
import type {
  ReleaseChecklist,
  ReleaseDeployOrder,
  ReleaseSide,
  ReleaseSummaryRun,
  ReleaseTicket,
} from '@lab/contracts'
import type { GitHubReview, GitHubWorkflowRun } from './github.js'
import { renderReleaseBranch } from './rules.js'

export const RELEASE_MARKER = '<!-- portal-release -->'
const LINK_PREFIX = '**PR ligada:**'
const SIDE_NAME: Record<ReleaseSide, string> = { front: 'Front', back: 'Back' }

export const sidesLabel = (sides: readonly ReleaseSide[]) =>
  sides.map((side) => SIDE_NAME[side]).join(' e ')

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortKeys(item)]),
    )
  }
  return value
}

/** SHA-256 of the canonical JSON, so key order never changes the hash of the same plan. */
export const planHash = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(sortKeys(value)))
    .digest('hex')

export const releaseDate = (now: Date) => renderReleaseBranch('{yyyy}-{mm}-{dd}', now)

export interface ChecklistGroup {
  sides: ReleaseSide[]
  repo: string
  tickets: readonly ReleaseTicket[]
}

/** One SQL and ENV checklist for the whole release, shared by every PR of the plan. */
export const buildChecklist = (groups: readonly ChecklistGroup[]): ReleaseChecklist => ({
  sql: groups.flatMap((group) =>
    group.tickets.flatMap((ticket) =>
      ticket.sql.map((sql) => ({
        sides: group.sides,
        repo: group.repo,
        key: ticket.key,
        pulls: ticket.pulls.map((pull) => pull.number),
        sql,
      })),
    ),
  ),
  env: groups.flatMap((group) =>
    group.tickets
      .filter((ticket) => ticket.env.names.length || ticket.env.notes.length)
      .map((ticket) => ({
        sides: group.sides,
        repo: group.repo,
        key: ticket.key,
        names: ticket.env.names,
        notes: ticket.env.notes,
      })),
  ),
})

export interface LinkedPull {
  sides: ReleaseSide[]
  repo: string
  pull: { number: number; url: string } | null
}

/** The line that points one release PR to the other side, filled once both PRs exist. */
const linkLine = (linked: LinkedPull) =>
  linked.pull
    ? `${LINK_PREFIX} ${sidesLabel(linked.sides)} em [${linked.repo}#${linked.pull.number}](${linked.pull.url})`
    : `${LINK_PREFIX} ${sidesLabel(linked.sides)} em ${linked.repo} (o link entra assim que a PR existir)`

/** Replaces the link line of a release body, keeping everything else byte for byte. */
export const withLink = (body: string, linked: LinkedPull) =>
  body
    .split('\n')
    .map((line) => (line.startsWith(LINK_PREFIX) ? linkLine(linked) : line))
    .join('\n')

export interface ReleaseBodyInput {
  project: { name: string }
  sides: ReleaseSide[]
  head: string
  base: string
  date: string
  tickets: readonly ReleaseTicket[]
  authors: readonly string[]
  deployOrder: ReleaseDeployOrder | null
  checklist: ReleaseChecklist
  linked: LinkedPull | null
}

const ticketHeading = (ticket: ReleaseTicket) => {
  if (!ticket.key) return `### Sem ticket: ${ticket.title}`
  const key = ticket.url ? `[${ticket.key}](${ticket.url})` : ticket.key
  return `### ${key}: ${ticket.title}`
}

const ticketBlock = (ticket: ReleaseTicket) => [
  ticketHeading(ticket),
  '',
  ...(ticket.summary ? [ticket.summary, ''] : []),
  ...ticket.pulls.map((pull) => `- [#${pull.number}](${pull.url}) ${pull.title} · @${pull.author}`),
  '',
]

const deployBlock = (order: ReleaseDeployOrder) => [
  '## Ordem de deploy',
  '',
  ...order.sides.map((side, index) => `${index + 1}. ${SIDE_NAME[side]}`),
  '',
  order.reason === 'migration'
    ? 'O back sobe primeiro porque traz migration.'
    : 'Ordem padrão cadastrada para o projeto.',
  '',
]

const origin = (item: { sides: ReleaseSide[]; key: string | null }) =>
  `**${sidesLabel(item.sides)}** · ${item.key ?? 'Sem ticket'}`

const pullRefs = (numbers: readonly number[]) => numbers.map((number) => '#' + number).join(', ')

const envNames = (names: readonly string[]) =>
  names.length ? ': ' + names.map((name) => '`' + name + '`').join(', ') : ''

const checklistBlock = (checklist: ReleaseChecklist) => [
  '## Checklist de deploy',
  '',
  '### SQL',
  '',
  ...(checklist.sql.length
    ? checklist.sql.flatMap((item) => [
        `- [ ] ${origin(item)} (${pullRefs(item.pulls)})`,
        '',
        '```sql',
        item.sql,
        '```',
        '',
      ])
    : ['Nenhum SQL nesta release.', '']),
  '### ENV',
  '',
  ...(checklist.env.length
    ? checklist.env.flatMap((item) => [
        `- [ ] ${origin(item)}${envNames(item.names)}`,
        ...item.notes.map((note) => `  - ${note}`),
      ])
    : ['Nenhuma variável de ambiente nesta release.']),
  '',
]

/** Release PR body in the lab template: tickets with their PRs and authors, then SQL and ENV. */
export const renderReleaseBody = (input: ReleaseBodyInput): string =>
  [
    RELEASE_MARKER,
    `**Release:** ${input.project.name} · ${sidesLabel(input.sides)} · \`${input.head}\` → \`${input.base}\` · ${input.date}`,
    ...(input.linked ? [linkLine(input.linked)] : []),
    '',
    ...(input.deployOrder ? deployBlock(input.deployOrder) : []),
    '## Tasks',
    '',
    ...(input.tickets.length
      ? input.tickets.flatMap(ticketBlock)
      : ['Nenhum PR novo desde o último corte.', '']),
    '## Autores',
    '',
    input.authors.length
      ? input.authors.map((login) => `@${login}`).join(', ')
      : 'Nenhum autor humano.',
    '',
    ...checklistBlock(input.checklist),
  ]
    .join('\n')
    .trimEnd()
    .concat('\n')

const VERSION_BRANCH = /^release\/v?(\d+\.\d+\.\d+)$/

/** Base tag name: `v1.4.0` for a versioned release branch, `release-AAAA-MM-DD` otherwise. */
export const releaseTagBase = (head: string, mergedAt: string) => {
  const version = VERSION_BRANCH.exec(head)?.[1]
  return version ? `v${version}` : `release-${releaseDate(new Date(mergedAt))}`
}

/** Candidate tag names in order; a taken name moves on to the next suffix. */
export const releaseTagCandidates = (base: string, count = 9) => [
  base,
  ...Array.from({ length: count - 1 }, (_, index) => `${base}-${index + 2}`),
]

/** Last decisive review of each person: an approval or a change request; later ones win. */
export const latestApprovals = (reviews: readonly GitHubReview[]) => {
  const latest = new Map<string, string>()
  const sorted = [...reviews].sort((a, b) =>
    (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''),
  )
  for (const review of sorted) {
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      latest.set(review.author, review.state)
    } else if (review.state === 'DISMISSED') {
      latest.delete(review.author)
    }
  }
  const withState = (state: string) =>
    [...latest.entries()].filter(([, value]) => value === state).map(([author]) => author)
  return { approved: withState('APPROVED'), changesRequested: withState('CHANGES_REQUESTED') }
}

const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'])

/** State of the latest run of the release summary workflow on the release branch. */
export const summarizeWorkflow = (runs: readonly GitHubWorkflowRun[]): ReleaseSummaryRun => {
  const run = runs[0]
  if (!run) return { state: 'none', url: null }
  if (run.status !== 'completed') return { state: 'pending', url: run.url }
  if (run.conclusion && FAILED.has(run.conclusion)) return { state: 'failure', url: run.url }
  return { state: 'success', url: run.url }
}
