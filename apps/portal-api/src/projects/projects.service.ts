import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type {
  DoraMetricsResponse,
  ProjectDetail,
  ProjectEntry,
  ProjectSourceState,
  ProjectSummary,
} from '@lab/contracts'
import type { Change } from '@lab/database'
import { type DoraRepo, computeDora, windowStart } from '@lab/dora'
import type { PanelData } from '@lab/eng-metrics/contract'
import { type FlowDataset, type Workflow, loadWorkflow } from '@lab/flow'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { DORA_SOURCE, type DoraSource } from '../dora/dora-source.js'
import { DORA_CATALOG } from '../dora/dora.service.js'
import { JIRA_DATA, type JiraData } from '../flow/jira-data.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { PANEL_SOURCE, type PanelSource } from '../review/panel-source.js'
import type { CatalogProject } from './catalog.js'
import {
  type EpicView,
  LIST_LIMIT,
  epicView,
  findProject,
  matchesTerm,
  mergedPullRequests,
  openPullRequests,
  projectDelivery,
  projectOfKey,
  resolveDecision,
  resolveSystem,
} from './rules.js'

export const PROJECT_CATALOG = Symbol('PROJECT_CATALOG')
export const PROJECTS_CLOCK = Symbol('PROJECTS_CLOCK')
export type ProjectsClock = () => Date

export const WINDOW_WEEKS = 12
const DAY = 86_400_000
const CHANGE_LOOKBACK_DAYS = 90

const state = (value: unknown): ProjectSourceState => (value === null ? 'unavailable' : 'ok')

/** Runs a source read and turns its 503 (no data collected yet) into null. */
const orUnavailable = async <T>(work: () => Promise<T>): Promise<T | null> => {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ServiceUnavailableException) return null
    throw error
  }
}

interface JiraSnapshot {
  workflow: Workflow
  datasets: Map<string, FlowDataset>
}

interface Crossed {
  view: EpicView | null
  jira: JiraSnapshot | null
  panel: PanelData | null
}

/**
 * Projects of the versioned catalog crossed with the Jira mirror, the review queue and the
 * DORA data. Each source that has no data yet degrades to `unavailable` instead of failing.
 */
@Injectable()
export class ProjectsService {
  private workflow: Promise<Workflow> | null = null

  constructor(
    @Inject(PROJECT_CATALOG) private readonly projects: CatalogProject[],
    private readonly handbook: HandbookService,
    @Inject(JIRA_DATA) private readonly jira: JiraData | null,
    @Inject(PANEL_SOURCE) private readonly panel: PanelSource,
    @Inject(DORA_SOURCE) private readonly dora: DoraSource,
    @Inject(DORA_CATALOG) private readonly doraRepos: DoraRepo[],
    @Inject(PROJECTS_CLOCK) private readonly clock: ProjectsClock,
    @Inject(CONFIG) private readonly config: Pick<PortalConfig, 'jiraWorkflowPath'>,
  ) {}

  async list(term?: string): Promise<ProjectSummary[]> {
    const found = this.projects.filter((project) => matchesTerm(project.entry, term))
    if (!found.length) return []
    const [jira, panel] = await Promise.all([
      this.loadJira(found.map((project) => project.entry)),
      orUnavailable(() => this.panel.load()),
    ])
    return found.map((project) => this.summary(project.entry, this.cross(project, jira, panel)))
  }

  async detail(id: string): Promise<ProjectDetail> {
    const project = this.projects.find((item) => item.entry.id === id)
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    const now = this.clock()
    const from = windowStart(now.getTime(), WINDOW_WEEKS)
    const [jira, panel, dora] = await Promise.all([
      this.loadJira([project.entry]),
      orUnavailable(() => this.panel.load()),
      this.loadDora(now, from),
    ])
    const crossed = this.cross(project, jira, panel)
    const { entry } = project
    const delivery = dora ? projectDelivery(dora.metrics, entry.repos) : { deploys: [], dora: [] }
    const handbook = this.handbook.snapshot()
    return {
      ...this.summary(entry, crossed),
      sources: { jira: state(jira), pullRequests: state(panel), dora: state(dora) },
      generatedAt: now.toISOString(),
      windowWeeks: WINDOW_WEEKS,
      tasks: crossed.view?.tasks ?? [],
      pullRequests: {
        open: crossed.panel ? this.openFor(entry, crossed) : [],
        merged: dora
          ? mergedPullRequests(dora.changes, entry.repos, new Date(from).toISOString()).slice(
              0,
              LIST_LIMIT,
            )
          : [],
      },
      deploys: delivery.deploys.slice(0, LIST_LIMIT),
      dora: delivery.dora,
      systems: entry.systems.map((system) => resolveSystem(handbook, system)),
      decisions: entry.decisions.map((decision) => resolveDecision(handbook, decision)),
      risks: entry.risks,
    }
  }

  /** Catalog entry found by id or name, for the chat tool; null when nothing matches. */
  find(reference: string): CatalogProject | null {
    return findProject(this.projects, reference)
  }

  names(): string[] {
    return this.projects.map((project) => `${project.entry.name} (${project.entry.id})`)
  }

  private cross(
    project: CatalogProject,
    jira: JiraSnapshot | null,
    panel: PanelData | null,
  ): Crossed {
    const key = project.entry.epic
    const dataset = key ? jira?.datasets.get(projectOfKey(key)) : undefined
    const view = key && jira && dataset ? epicView(key, dataset, jira.workflow) : null
    return { view, jira, panel }
  }

  private openFor(entry: ProjectEntry, crossed: Crossed) {
    if (!crossed.panel) return []
    const keys = new Set(crossed.view?.tasks.map((task) => task.key) ?? [])
    if (entry.epic) keys.add(entry.epic)
    return openPullRequests(crossed.panel, entry.repos, keys)
  }

  private summary(entry: ProjectEntry, crossed: Crossed): ProjectSummary {
    return {
      id: entry.id,
      name: entry.name,
      objective: entry.objective,
      status: entry.status,
      owner: entry.owner,
      epicKey: entry.epic,
      repos: entry.repos,
      epic: crossed.view?.epic ?? null,
      openPullRequests: crossed.panel ? this.openFor(entry, crossed).length : null,
      sources: { jira: state(crossed.jira), pullRequests: state(crossed.panel) },
    }
  }

  private async loadJira(entries: ProjectEntry[]): Promise<JiraSnapshot | null> {
    const jira = this.jira
    if (!jira) return null
    const keys = [
      ...new Set(entries.flatMap((entry) => (entry.epic ? [projectOfKey(entry.epic)] : []))),
    ]
    return orUnavailable(async () => {
      const [workflow, datasets] = await Promise.all([
        this.loadWorkflow(),
        Promise.all(keys.map(async (key) => [key, await jira.load(key)] as const)),
      ])
      return { workflow, datasets: new Map(datasets) }
    })
  }

  private async loadDora(
    now: Date,
    from: number,
  ): Promise<{ metrics: DoraMetricsResponse; changes: Change[] } | null> {
    return orUnavailable(async () => {
      const data = await this.dora.load({
        deploysSince: new Date(from).toISOString(),
        changesSince: new Date(from - CHANGE_LOOKBACK_DAYS * DAY).toISOString(),
        incidentsSince: new Date(from).toISOString(),
      })
      const metrics = computeDora({
        repos: this.doraRepos,
        ...data,
        now: now.toISOString(),
        weeks: WINDOW_WEEKS,
      })
      return { metrics, changes: data.changes }
    })
  }

  private loadWorkflow(): Promise<Workflow> {
    this.workflow ??= loadWorkflow(this.config.jiraWorkflowPath).catch((error: unknown) => {
      this.workflow = null
      throw error
    })
    return this.workflow
  }
}
