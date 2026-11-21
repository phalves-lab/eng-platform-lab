import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type {
  MyJiraWork,
  MyReviewWork,
  MyWorkQuery,
  MyWorkResponse,
  Person,
  TeamMemberLoad,
  TeamWorkQuery,
  TeamWorkResponse,
  User,
} from '@lab/contracts'
import type { QueueRow } from '@lab/eng-metrics/contract'
import {
  type OpenWorkItem,
  type WorkDataset,
  type Workflow,
  blockedByAccount,
  loadWorkflow,
  myTasks,
  openWork,
  sameAccount,
  workLoad,
} from '@lab/flow'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { PEOPLE, type PeopleDirectory } from '../people/people.js'
import { buildMyQueue } from '../review/my-queue.js'
import { ReviewService } from '../review/review.service.js'
import { reviewWork, toWorkItem, workAlerts } from './rules.js'
import { WORK_DATA, type WorkData } from './work-data.js'

export const WORK_CLOCK = Symbol('WORK_CLOCK')
export type WorkClock = () => Date

type JiraLoad =
  | { state: 'ready'; dataset: WorkDataset; workflow: Workflow }
  | { state: 'unavailable'; reason: 'no_database' | 'not_collected' }

/** Personal and team views over the Jira mirror and the review queue; nothing here writes. */
@Injectable()
export class WorkService {
  private workflow: Promise<Workflow> | null = null

  constructor(
    @Inject(CONFIG) private readonly config: PortalConfig,
    @Inject(WORK_DATA) private readonly data: WorkData | null,
    @Inject(PEOPLE) private readonly people: PeopleDirectory,
    @Inject(WORK_CLOCK) private readonly clock: WorkClock,
    private readonly review: ReviewService,
  ) {}

  async myWork(user: User, query: MyWorkQuery): Promise<MyWorkResponse> {
    const now = this.clock()
    const staleAfter = query.staleDays ?? this.config.staleAfterBusinessDays
    const person = this.people.byLogin(user.login)
    const github = person ? person.github : user.login
    const [jira, review] = await Promise.all([
      this.myJira(person, now, staleAfter),
      this.myReview(query.dataset, github),
    ])
    return {
      generatedAt: now.toISOString(),
      login: user.login,
      person,
      staleAfterBusinessDays: staleAfter,
      jira,
      review,
      alerts: workAlerts(jira, review),
    }
  }

  async teamWork(user: User, query: TeamWorkQuery): Promise<TeamWorkResponse> {
    const now = this.clock()
    const staleAfter = query.staleDays ?? this.config.staleAfterBusinessDays
    const team = query.team
      ? this.people.team(query.team)
      : (this.people.byLogin(user.login)?.team ?? this.people.teams[0] ?? null)
    if (!team) throw new NotFoundException('Team not found in catalog/people')
    const members = this.people.members(team.id)
    const [jira, queue] = await Promise.all([this.loadJira(), this.queue(query.dataset)])
    const items =
      jira.state === 'ready' ? openWork({ ...jira, now, staleAfterBusinessDays: staleAfter }) : null
    const load = (member: Person): TeamMemberLoad => ({
      login: member.login,
      name: member.name,
      role: member.role,
      jira: items && member.jira ? workLoad(items, member.jira) : null,
      pendingReviews:
        queue && member.github ? buildMyQueue(queue, member.github).toReview.length : null,
    })
    return {
      generatedAt: now.toISOString(),
      team,
      teams: this.people.teams,
      staleAfterBusinessDays: staleAfter,
      jira: items
        ? { state: 'ready', staleItems: this.teamStale(items, members) }
        : { state: 'unavailable', reason: jira.state === 'ready' ? 'not_collected' : jira.reason },
      review: { state: queue ? 'ready' : 'unavailable' },
      members: members.map(load),
    }
  }

  private teamStale(items: OpenWorkItem[], members: Person[]) {
    return items.flatMap((item) => {
      const owner = members.find((member) => sameAccount(member.jira, item.assignee))
      return item.stale && owner ? [{ ...toWorkItem(item), assignee: owner.name }] : []
    })
  }

  private async myJira(person: Person | null, now: Date, staleAfter: number): Promise<MyJiraWork> {
    const jira = await this.loadJira()
    if (jira.state === 'unavailable') return jira
    if (!person) return { state: 'unavailable', reason: 'unknown_person' }
    if (!person.jira) return { state: 'unavailable', reason: 'no_jira_account' }
    const items = openWork({ ...jira, now, staleAfterBusinessDays: staleAfter })
    const tasks = myTasks(items, person.jira)
    return {
      state: 'ready',
      inProgress: tasks.inProgress.map(toWorkItem),
      review: tasks.review.map(toWorkItem),
      blocked: tasks.blocked.map(toWorkItem),
      stale: tasks.stale.map(toWorkItem),
      blockedByMe: blockedByAccount(jira.dataset, jira.workflow, person.jira).map((item) => ({
        ...item,
        assignee: this.people.nameOf(item.assignee, 'jira'),
      })),
    }
  }

  private async myReview(dataset: string, github: string | null): Promise<MyReviewWork> {
    if (!github) return { state: 'unavailable', reason: 'no_github_account' }
    const queue = await this.queue(dataset)
    if (!queue) return { state: 'unavailable', reason: 'not_collected' }
    const mine = buildMyQueue(queue, github)
    return reviewWork(dataset, github, {
      ...mine,
      toReview: mine.toReview.map((row) => ({
        ...row,
        author: this.people.nameOf(row.author, 'github') ?? row.author,
      })),
    })
  }

  private async queue(dataset: string): Promise<QueueRow[] | null> {
    try {
      return (await this.review.dataset(dataset)).queue
    } catch (error) {
      if (error instanceof ServiceUnavailableException) return null
      throw error
    }
  }

  private async loadJira(): Promise<JiraLoad> {
    if (!this.data) return { state: 'unavailable', reason: 'no_database' }
    const dataset = await this.data.load()
    if (!dataset) return { state: 'unavailable', reason: 'not_collected' }
    return { state: 'ready', dataset, workflow: await this.loadWorkflow() }
  }

  private loadWorkflow(): Promise<Workflow> {
    this.workflow ??= loadWorkflow(this.config.jiraWorkflowPath).catch((error: unknown) => {
      this.workflow = null
      throw error
    })
    return this.workflow
  }
}
