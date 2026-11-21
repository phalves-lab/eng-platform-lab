import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type {
  BoardResponse,
  BoardSummary,
  FlowMetricsQuery,
  FlowMetricsResponse,
} from '@lab/contracts'
import {
  type Workflow,
  boardSummaries,
  buildBoard,
  computeFlowMetrics,
  loadWorkflow,
} from '@lab/flow'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { JIRA_DATA, type JiraData, jiraUnavailable } from './jira-data.js'

export const FLOW_CLOCK = Symbol('FLOW_CLOCK')
export type Clock = () => Date

/** Flow metrics and boards over the Jira mirror, using the versioned workflow mapping. */
@Injectable()
export class FlowService {
  private workflow: Promise<Workflow> | null = null

  constructor(
    @Inject(CONFIG) private readonly config: PortalConfig,
    @Inject(JIRA_DATA) private readonly data: JiraData | null,
    @Inject(FLOW_CLOCK) private readonly clock: Clock,
  ) {}

  async flow(query: FlowMetricsQuery): Promise<FlowMetricsResponse> {
    const dataset = await this.source().load()
    if (dataset.issues.length === 0) throw jiraUnavailable()
    return computeFlowMetrics({
      dataset,
      workflow: await this.loadWorkflow(),
      now: this.clock(),
      weeks: query.weeks,
      ...(query.project ? { project: query.project } : {}),
      ...(query.component ? { component: query.component } : {}),
    })
  }

  async boards(): Promise<BoardSummary[]> {
    const dataset = await this.source().load()
    if (dataset.issues.length === 0) throw jiraUnavailable()
    return boardSummaries(dataset, await this.loadWorkflow())
  }

  async board(project: string): Promise<BoardResponse> {
    const dataset = await this.source().load(project)
    if (!dataset.issues.some((issue) => issue.project === project)) {
      throw new NotFoundException(`No Jira board for project ${project}`)
    }
    return buildBoard({
      project,
      dataset,
      workflow: await this.loadWorkflow(),
      now: this.clock(),
    })
  }

  private source(): JiraData {
    if (!this.data) throw jiraUnavailable()
    return this.data
  }

  private loadWorkflow(): Promise<Workflow> {
    this.workflow ??= loadWorkflow(this.config.jiraWorkflowPath).catch((error: unknown) => {
      this.workflow = null
      throw error
    })
    return this.workflow
  }
}
