import type {
  JiraIssue,
  JiraIssueLink,
  JiraSprint,
  JiraSprintIssue,
  JiraStatusChange,
} from '@lab/database'
import { z } from 'zod'
import type { JiraHttp } from './http.js'
import { type JiraSource, toIsoInstant, withoutTrailingSlashes } from './source.js'

const PAGE_SIZE = 100
const SPRINT_PAGE_SIZE = 50

const NamedSchema = z.object({ name: z.string() })
const BLOCKS_LINK = 'Blocks'

const IssueLinkSchema = z.object({
  type: NamedSchema,
  inwardIssue: z.object({ key: z.string() }).optional(),
  outwardIssue: z.object({ key: z.string() }).optional(),
})

const own = (raw: object, key: string): unknown =>
  Object.hasOwn(raw, key) ? Reflect.get(raw, key) : null

/**
 * Changelog items carry `fromString` and `toString`; reading them as own properties keeps the
 * inherited `Object.prototype.toString` from ever passing as a status name.
 */
const ChangelogItemSchema = z.preprocess(
  (raw) =>
    typeof raw === 'object' && raw !== null
      ? {
          field: own(raw, 'field'),
          from: own(raw, 'from'),
          to: own(raw, 'to'),
          fromLabel: own(raw, 'fromString'),
          toLabel: own(raw, 'toString'),
        }
      : raw,
  z.object({
    field: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    fromLabel: z.string().nullable(),
    toLabel: z.string().nullable(),
  }),
)

const HistorySchema = z.object({ created: z.string(), items: z.array(ChangelogItemSchema) })
type History = z.infer<typeof HistorySchema>

const SprintFieldSchema = z
  .array(z.object({ id: z.number().int().positive() }).loose())
  .nullable()
  .optional()

const CloudIssueSchema = z.object({
  key: z.string(),
  fields: z
    .object({
      summary: z.string().nullable().optional(),
      issuetype: NamedSchema,
      status: NamedSchema,
      components: z.array(NamedSchema).nullable().optional(),
      parent: z
        .object({
          key: z.string(),
          fields: z.object({ issuetype: NamedSchema }).loose().optional(),
        })
        .nullable()
        .optional(),
      assignee: z.object({ displayName: z.string() }).nullable().optional(),
      issuelinks: z.array(IssueLinkSchema).nullable().optional(),
      created: z.string(),
      resolutiondate: z.string().nullable().optional(),
    })
    .loose(),
  changelog: z
    .object({ total: z.number().int().nonnegative(), histories: z.array(HistorySchema) })
    .optional(),
})
type CloudIssue = z.infer<typeof CloudIssueSchema>

const SearchPageSchema = z.object({
  issues: z.array(CloudIssueSchema),
  nextPageToken: z.string().nullable().optional(),
  isLast: z.boolean().optional(),
})

const ChangelogPageSchema = z.object({
  values: z.array(HistorySchema),
  isLast: z.boolean().optional(),
  total: z.number().int().nonnegative().optional(),
})

const SprintPageSchema = z.object({
  values: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      state: z.enum(['future', 'active', 'closed']),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      completeDate: z.string().nullable().optional(),
    }),
  ),
  isLast: z.boolean().optional(),
})

interface JiraBoardRef {
  project: string
  boardId: number
}

export interface CloudJiraSourceOptions {
  http: JiraHttp
  site: string
  projects: string[]
  boards: JiraBoardRef[]
  sprintField: string
  lookbackDays: number
}

const isoOrNull = (value: string | null | undefined) => (value ? toIsoInstant(value) : null)

/** JQL for every non-subtask issue updated in the window, plus all epics for the progress view. */
export const buildJql = (projects: string[], lookbackDays: number) =>
  `project in (${projects.join(', ')}) AND (updated >= -${lookbackDays}d OR issuetype = Epic) ` +
  'AND issuetype not in subTaskIssueTypes() ORDER BY key ASC'

const fetchSprints = async (http: JiraHttp, board: JiraBoardRef): Promise<JiraSprint[]> => {
  const sprints: JiraSprint[] = []
  for (let startAt = 0; ; startAt += SPRINT_PAGE_SIZE) {
    const page = await http.get(
      `/rest/agile/1.0/board/${board.boardId}/sprint`,
      { startAt, maxResults: SPRINT_PAGE_SIZE },
      SprintPageSchema,
    )
    for (const sprint of page.values) {
      const completedAt = isoOrNull(sprint.completeDate) ?? isoOrNull(sprint.endDate)
      if (sprint.state === 'closed' && completedAt === null) continue
      sprints.push({
        id: sprint.id,
        project: board.project,
        name: sprint.name,
        state: sprint.state,
        startsAt: isoOrNull(sprint.startDate),
        endsAt: isoOrNull(sprint.endDate),
        completedAt: sprint.state === 'closed' ? completedAt : isoOrNull(sprint.completeDate),
      })
    }
    if (page.isLast !== false || page.values.length === 0) return sprints
  }
}

const fetchHistories = async (http: JiraHttp, issue: CloudIssue): Promise<History[]> => {
  const inline = issue.changelog?.histories ?? []
  if (!issue.changelog || inline.length >= issue.changelog.total) return inline
  const histories: History[] = []
  for (let startAt = 0; ; startAt += PAGE_SIZE) {
    const page = await http.get(
      `/rest/api/3/issue/${encodeURIComponent(issue.key)}/changelog`,
      { startAt, maxResults: PAGE_SIZE },
      ChangelogPageSchema,
    )
    histories.push(...page.values)
    const total = page.total ?? issue.changelog.total
    if (page.isLast === true || page.values.length === 0 || histories.length >= total) {
      return histories
    }
  }
}

const byCreated = (a: History, b: History) => Date.parse(a.created) - Date.parse(b.created)

const statusChanges = (key: string, histories: History[]): JiraStatusChange[] =>
  histories.flatMap((history) =>
    history.items.flatMap((item) =>
      item.field === 'status' && item.toLabel && item.toLabel !== item.fromLabel
        ? [
            {
              issueKey: key,
              fromStatus: item.fromLabel || null,
              toStatus: item.toLabel,
              changedAt: toIsoInstant(history.created),
            },
          ]
        : [],
    ),
  )

const sprintIds = (value: string | null | undefined) =>
  new Set(
    (value ?? '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  )

/** When the issue entered each sprint, from the Sprint field history; creation time otherwise. */
const sprintMembership = (
  key: string,
  ids: number[],
  histories: History[],
  createdAt: string,
): JiraSprintIssue[] =>
  ids.map((sprintId) => {
    const added = histories.find((history) =>
      history.items.some(
        (item) =>
          item.field === 'Sprint' &&
          sprintIds(item.to).has(sprintId) &&
          !sprintIds(item.from).has(sprintId),
      ),
    )
    return {
      sprintId,
      issueKey: key,
      addedAt: added ? toIsoInstant(added.created) : createdAt,
    }
  })

/**
 * Blocking links seen from one issue: an `inwardIssue` on a Blocks link blocks this issue and an
 * `outwardIssue` is blocked by it.
 */
const blockingLinks = (issue: CloudIssue): JiraIssueLink[] =>
  (issue.fields.issuelinks ?? []).flatMap((link) => {
    if (link.type.name !== BLOCKS_LINK) return []
    if (link.inwardIssue) return [{ blockedKey: issue.key, blockerKey: link.inwardIssue.key }]
    if (link.outwardIssue) return [{ blockedKey: link.outwardIssue.key, blockerKey: issue.key }]
    return []
  })

/** Jira Cloud adapter: REST v3 JQL search with changelog and the agile API for sprints. */
export const createCloudJiraSource = (options: CloudJiraSourceOptions): JiraSource => ({
  kind: 'cloud',
  fetch: async () => {
    const site = withoutTrailingSlashes(options.site)
    const sprints = (
      await Promise.all(options.boards.map((board) => fetchSprints(options.http, board)))
    ).flat()
    const known = new Set(sprints.map((sprint) => sprint.id))
    const sprintStart = new Map(sprints.map((sprint) => [sprint.id, sprint.startsAt ?? '']))

    const issues: JiraIssue[] = []
    const changes: JiraStatusChange[] = []
    const sprintIssues: JiraSprintIssue[] = []
    const links: JiraIssueLink[] = []
    let nextPageToken: string | null | undefined
    do {
      const page = await options.http.search(
        {
          jql: buildJql(options.projects, options.lookbackDays),
          fields: [
            'summary',
            'issuetype',
            'status',
            'components',
            'parent',
            'assignee',
            'issuelinks',
            'created',
            'resolutiondate',
            options.sprintField,
          ],
          expand: 'changelog',
          maxResults: PAGE_SIZE,
          ...(nextPageToken ? { nextPageToken } : {}),
        },
        SearchPageSchema,
      )
      for (const issue of page.issues) {
        const histories = (await fetchHistories(options.http, issue)).toSorted(byCreated)
        const createdAt = toIsoInstant(issue.fields.created)
        const ids = (SprintFieldSchema.parse(issue.fields[options.sprintField]) ?? [])
          .map((sprint) => sprint.id)
          .filter((id) => known.has(id))
        const membership = sprintMembership(issue.key, ids, histories, createdAt)
        const parent = issue.fields.parent
        const latestSprint = ids.toSorted((a, b) =>
          (sprintStart.get(a) ?? '').localeCompare(sprintStart.get(b) ?? ''),
        )
        issues.push({
          key: issue.key,
          project: issue.key.split('-')[0] ?? '',
          component: issue.fields.components?.[0]?.name ?? null,
          issueType: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          summary: issue.fields.summary || null,
          url: `${site}/browse/${issue.key}`,
          epicKey: parent?.fields?.issuetype.name === 'Epic' ? parent.key : null,
          sprintId: latestSprint.at(-1) ?? null,
          assignee: issue.fields.assignee?.displayName ?? null,
          createdAt,
          resolvedAt: isoOrNull(issue.fields.resolutiondate),
        })
        changes.push(...statusChanges(issue.key, histories))
        sprintIssues.push(...membership)
        links.push(...blockingLinks(issue))
      }
      nextPageToken = page.isLast === true ? null : page.nextPageToken
    } while (nextPageToken)

    return { sprints, issues, changes, sprintIssues, links }
  },
})
