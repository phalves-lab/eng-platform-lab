import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type ReleaseExecuteRequest,
  type ReleaseExecuteResponse,
  type ReleasePlan,
  type ReleasePlanPull,
  type ReleasePlanRequest,
  type ReleaseProject,
  type ReleasePublishExecute,
  type ReleasePublishPlan,
  type ReleasePublishRequest,
  type ReleaseRun,
  type ReleaseRunResult,
  ReleaseRunResultSchema,
  type ReleaseSide,
  type ReleaseSidePreview,
  type ReleaseTicket,
  type ReleaseTracking,
  type ReleaseTrackedPull,
  type ReleaseWriteStep,
  type User,
} from '@lab/contracts'
import type { StoredReleaseRun } from '@lab/database'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { GitHubError } from './github.js'
import { GITHUB_WRITER, type GitHubWriter } from './github-writer.js'
import {
  RELEASE_MARKER,
  buildChecklist,
  latestApprovals,
  planHash,
  releaseDate,
  releaseTagBase,
  releaseTagCandidates,
  renderReleaseBody,
  sidesLabel,
  summarizeWorkflow,
  withLink,
} from './plan-rules.js'
import { ReleasesService } from './releases.service.js'
import { deployOrder, summarizeChecks } from './rules.js'
import { RELEASE_RUN_STORE, type ReleaseRunStore } from './run-store.js'

const SUMMARY_WORKFLOW = 'release-summary.yml'
const WRITE_DISABLED_MESSAGE =
  'A escrita no GitHub está desabilitada neste ambiente (PORTAL_RELEASE_WRITE_ENABLED=false).'
const NO_STORE_MESSAGE =
  'Gerar, acompanhar e publicar releases exige o banco do portal (DATABASE_URL) para a auditoria.'
const ROLE_MESSAGE = 'Só líder ou admin gera e publica a release; dev vê só a prévia.'
const SIDES: ReleaseSide[] = ['front', 'back']
const HISTORY_LIMIT = 30
const TRACKED_LIMIT = 10

interface RepoGroup {
  repo: string
  sides: ReleaseSide[]
  preview: ReleaseSidePreview
}

interface Draft {
  sides: ReleaseSide[]
  repo: string
  head: string
  sha: string
  branch: ReleasePlanPull['branch']
  existing: ReleasePlanPull['existing']
  tickets: ReleaseTicket[]
  pulls: number
  authors: string[]
}

interface RunContext {
  pulls: readonly ReleasePlanPull[]
  publishNumber: number | null
}

const canWrite = (user: User) => user.role === 'lead' || user.role === 'admin'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Falha desconhecida ao escrever no GitHub.'

const sameRepos = (typed: readonly string[], expected: readonly string[]) =>
  typed.length === expected.length && expected.every((repo) => typed.includes(repo))

const groupByRepo = (sides: readonly ReleaseSidePreview[]): RepoGroup[] => {
  const groups: RepoGroup[] = []
  for (const preview of sides) {
    const group = groups.find((item) => item.repo === preview.repo)
    if (group) group.sides.push(preview.side)
    else groups.push({ repo: preview.repo, sides: [preview.side], preview })
  }
  return groups
}

const emptyResult = (total: number): ReleaseRunResult => ({
  status: 'success',
  pulls: [],
  branches: [],
  release: null,
  completed: 0,
  total,
  error: null,
})

const storedResult = (run: StoredReleaseRun): ReleaseRunResult => {
  const parsed = ReleaseRunResultSchema.safeParse(run.result)
  if (parsed.success) return parsed.data
  return { ...emptyResult(0), status: run.status, error: 'Registro de auditoria ilegível.' }
}

const pullKey = (repo: string, number: number) => `${repo}#${number}`

/**
 * Writes a release on GitHub from a plan the person saw first. Plans read GitHub without cache;
 * execution rebuilds the plan and only runs when its hash matches, every repository was typed by hand,
 * the person is lead or admin, the write flag is on and the attempt can be audited.
 */
@Injectable()
export class ReleaseWriteService {
  private readonly running = new Set<string>()

  constructor(
    @Inject(CONFIG) private readonly config: PortalConfig,
    private readonly releases: ReleasesService,
    @Inject(GITHUB_WRITER) private readonly writer: GitHubWriter | null,
    @Inject(RELEASE_RUN_STORE) private readonly store: ReleaseRunStore | null,
  ) {}

  plan(user: User, request: ReleasePlanRequest, now = new Date()): Promise<ReleasePlan> {
    this.assertCanWrite(user)
    return this.buildPlan(request, now)
  }

  async execute(
    user: User,
    request: ReleaseExecuteRequest,
    now = new Date(),
  ): Promise<ReleaseExecuteResponse> {
    this.assertCanWrite(user)
    const project = this.releases.project(request.project)
    const reject = this.rejecter(user, project.id, 'release', request.hash, { request })
    const writer = await this.writerOrReject(reject)
    const expected = this.reposOf(project, request.side)
    if (!sameRepos(request.confirm, expected)) {
      await reject('Confirmação não confere.')
      throw new BadRequestException(
        `Digite o nome de cada repositório exatamente como no plano: ${expected.join(', ')}.`,
      )
    }
    return this.exclusive(project.id, async () => {
      const plan = await this.buildPlan(request, now)
      await this.assertRunnable(plan, request.hash, reject)
      return this.runAndRecord(user, project.id, 'release', plan, writer, {
        pulls: plan.pulls,
        publishNumber: null,
      })
    })
  }

  async publishPlan(
    user: User,
    request: ReleasePublishRequest,
    now = new Date(),
  ): Promise<ReleasePublishPlan> {
    this.assertCanWrite(user)
    return this.buildPublishPlan(request, now)
  }

  async publishExecute(
    user: User,
    request: ReleasePublishExecute,
    now = new Date(),
  ): Promise<ReleaseExecuteResponse> {
    this.assertCanWrite(user)
    const project = this.releases.project(request.project)
    const reject = this.rejecter(user, project.id, 'publish', request.hash, { request })
    const writer = await this.writerOrReject(reject)
    if (!sameRepos(request.confirm, [request.repo])) {
      await reject('Confirmação não confere.')
      throw new BadRequestException(`Digite o nome do repositório: ${request.repo}.`)
    }
    return this.exclusive(project.id, async () => {
      const plan = await this.buildPublishPlan(request, now)
      await this.assertRunnable(plan, request.hash, reject)
      return this.runAndRecord(user, project.id, 'publish', plan, writer, {
        pulls: [],
        publishNumber: plan.number,
      })
    })
  }

  async tracking(projectId: string, now = new Date()): Promise<ReleaseTracking> {
    const project = this.releases.project(projectId)
    const runs = await this.requireStore().list({ projectId: project.id, limit: 200 })
    const published = this.publishedPulls(runs)
    const client = this.releases.client(true)
    const pulls = await Promise.all(
      this.openedPulls(runs)
        .slice(0, TRACKED_LIMIT)
        .map(async (opened): Promise<ReleaseTrackedPull> => {
          const detail = await this.releases.call(client.pull(opened.repo, opened.number))
          const [reviews, runsOnHead, summary] = await this.releases.call(
            Promise.all([
              client.reviews(opened.repo, opened.number),
              client.checkRuns(opened.repo, detail.headSha),
              client.workflowRuns(opened.repo, SUMMARY_WORKFLOW, detail.headRef),
            ]),
          )
          let state: ReleaseTrackedPull['state'] = 'closed'
          if (detail.merged) state = 'merged'
          else if (detail.state === 'open') state = 'open'
          return {
            ...opened,
            url: detail.url,
            title: detail.title,
            state,
            mergeable: detail.mergeable,
            mergedAt: detail.mergedAt,
            mergeSha: detail.mergeSha,
            summary: summarizeWorkflow(summary),
            checks: summarizeChecks(runsOnHead),
            approvals: latestApprovals(reviews),
            published: published.get(pullKey(opened.repo, opened.number)) ?? null,
          }
        }),
    )
    return {
      project: { id: project.id, name: project.name },
      generatedAt: now.toISOString(),
      writeEnabled: this.config.releaseWrite.enabled,
      pulls,
    }
  }

  async history(projectId: string): Promise<ReleaseRun[]> {
    const project = this.releases.project(projectId)
    const runs = await this.requireStore().list({ projectId: project.id, limit: HISTORY_LIMIT })
    return runs.map((run) => ({
      id: run.id,
      projectId: run.projectId,
      action: run.action,
      actor: run.actor,
      role: run.role,
      planHash: run.planHash,
      createdAt: run.createdAt,
      result: storedResult(run),
    }))
  }

  private assertCanWrite(user: User) {
    if (!canWrite(user)) throw new ForbiddenException(ROLE_MESSAGE)
  }

  private requireStore(): ReleaseRunStore {
    if (!this.store) throw new ServiceUnavailableException(NO_STORE_MESSAGE)
    return this.store
  }

  private async writerOrReject(reject: (reason: string) => Promise<void>): Promise<GitHubWriter> {
    if (!this.config.releaseWrite.enabled || !this.writer) {
      await reject(WRITE_DISABLED_MESSAGE)
      throw new ForbiddenException(WRITE_DISABLED_MESSAGE)
    }
    this.requireStore()
    return this.writer
  }

  private rejecter(
    user: User,
    projectId: string,
    action: 'release' | 'publish',
    hash: string,
    plan: Record<string, unknown>,
  ) {
    return async (reason: string) => {
      if (!this.store) return
      await this.store.record({
        projectId,
        action,
        actor: user.login,
        role: user.role,
        planHash: hash,
        plan,
        status: 'rejected',
        result: { ...emptyResult(0), status: 'rejected', error: reason },
      })
    }
  }

  private async assertRunnable(
    plan: { hash: string; blockers: string[] },
    hash: string,
    reject: (reason: string) => Promise<void>,
  ) {
    if (plan.hash !== hash) {
      await reject('Plano mudou desde a prévia.')
      throw new ConflictException(
        'O plano mudou desde que foi gerado (o GitHub andou). Gere o plano de novo e confira.',
      )
    }
    if (plan.blockers.length) {
      await reject(plan.blockers.join(' '))
      throw new ConflictException(plan.blockers.join(' '))
    }
  }

  private async exclusive<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    if (this.running.has(projectId)) {
      throw new ConflictException('Já existe uma escrita em andamento para este projeto.')
    }
    this.running.add(projectId)
    try {
      return await work()
    } finally {
      this.running.delete(projectId)
    }
  }

  private reposOf(project: ReleaseProject, side: ReleasePlanRequest['side']): string[] {
    const sides = side === 'both' ? SIDES : [side]
    return [...new Set(sides.map((item) => this.releases.repoOf(project, item)))]
  }

  private async buildPlan(request: ReleasePlanRequest, now: Date): Promise<ReleasePlan> {
    const project = this.releases.project(request.project)
    const preview = await this.releases.preview(
      {
        project: project.id,
        side: request.side,
        ...(request.source ? { source: request.source } : {}),
        ...(request.target ? { target: request.target } : {}),
      },
      now,
      { fresh: true },
    )
    const first = preview.sides[0] as ReleaseSidePreview
    const { source, target } = first
    const blockers: string[] = []
    const drafts = await Promise.all(
      groupByRepo(preview.sides).map((group) =>
        this.draft(project, group, source, target, now, blockers),
      ),
    )
    const checklist = buildChecklist(drafts)
    const back = drafts.find((item) => item.sides.includes('back'))
    const order = preview.sides.length > 1 ? deployOrder(project, back?.tickets ?? []) : null
    const date = releaseDate(now)
    const labels = [project.labels.release, project.labels.notes]

    const pulls: ReleasePlanPull[] = drafts.map((item) => {
      const other = drafts.find((candidate) => candidate !== item)
      return {
        sides: item.sides,
        repo: item.repo,
        head: item.head,
        base: target,
        sha: item.sha,
        branch: item.branch,
        existing: item.existing,
        title:
          drafts.length > 1
            ? `chore(release): release ${date} (${sidesLabel(item.sides).toLowerCase()})`
            : `chore(release): release ${date}`,
        body: renderReleaseBody({
          project,
          sides: item.sides,
          head: item.head,
          base: target,
          date,
          tickets: item.tickets,
          authors: item.authors,
          deployOrder: order,
          checklist,
          linked: other ? { sides: other.sides, repo: other.repo, pull: other.existing } : null,
        }),
        labels,
        assignees: item.authors,
        tickets: item.tickets.length,
        pulls: item.pulls,
      }
    })

    const steps = pulls.flatMap((pull): ReleaseWriteStep[] => [
      ...(pull.branch
        ? [
            pull.branch.action === 'create'
              ? {
                  kind: 'create-branch' as const,
                  repo: pull.repo,
                  branch: pull.branch.name,
                  from: source,
                  sha: pull.sha,
                }
              : {
                  kind: 'reuse-branch' as const,
                  repo: pull.repo,
                  branch: pull.branch.name,
                  sha: pull.sha,
                },
          ]
        : []),
      pull.existing
        ? {
            kind: 'update-pull' as const,
            repo: pull.repo,
            number: pull.existing.number,
            url: pull.existing.url,
            body: pull.body,
          }
        : {
            kind: 'create-pull' as const,
            repo: pull.repo,
            head: pull.head,
            base: pull.base,
            title: pull.title,
            body: pull.body,
          },
      { kind: 'add-labels' as const, repo: pull.repo, labels: pull.labels },
      ...(pull.assignees.length
        ? [{ kind: 'add-assignees' as const, repo: pull.repo, logins: pull.assignees }]
        : []),
    ])
    if (pulls.length > 1 && pulls.some((pull) => !pull.existing)) {
      steps.push({ kind: 'link-pulls', repos: pulls.map((pull) => pull.repo) })
    }

    return {
      kind: 'release',
      project: { id: project.id, name: project.name, mode: project.mode },
      side: preview.side,
      source,
      target,
      generatedAt: now.toISOString(),
      pulls,
      steps,
      checklist,
      deployOrder: order,
      blockers,
      confirm: pulls.map((pull) => pull.repo),
      hash: planHash({
        project: project.id,
        side: preview.side,
        source,
        target,
        mode: project.mode,
        steps,
        blockers,
      }),
      writeEnabled: this.config.releaseWrite.enabled,
    }
  }

  private async draft(
    project: ReleaseProject,
    group: RepoGroup,
    source: string,
    target: string,
    now: Date,
    blockers: string[],
  ): Promise<Draft> {
    const client = this.releases.client(true)
    const { repo } = group
    let preview = group.preview
    const sourceHead = await this.releases.call(client.branchHead(repo, source))
    if (!sourceHead) throw new NotFoundException(`Branch ${source} não encontrada em ${repo}.`)
    let head = source
    let sha = sourceHead.sha
    let branch: Draft['branch'] = null
    let existing: Draft['existing'] = null

    if (preview.openRelease) {
      existing = { number: preview.openRelease.number, url: preview.openRelease.url }
      head = preview.openRelease.head
      if (head !== source) {
        const current = await this.releases.call(client.branchHead(repo, head))
        if (current) {
          sha = current.sha
          preview = await this.releases.previewSide(project, preview.side, source, target, now, {
            fresh: true,
            mergedBefore: current.date,
          })
        } else {
          blockers.push(`A branch ${head} da PR #${existing.number} não existe mais em ${repo}.`)
        }
      }
    } else if (project.mode === 'branch' && preview.releaseBranch) {
      head = preview.releaseBranch
      branch = await this.releaseBranch(repo, head, sourceHead.sha, blockers)
    }

    if (!existing && preview.pulls === 0) {
      blockers.push(
        `Nada novo para a release em ${repo}: nenhum PR mergeado em ${source} desde o último corte.`,
      )
    }
    return {
      sides: group.sides,
      repo,
      head,
      sha,
      branch,
      existing,
      tickets: preview.tickets,
      pulls: preview.pulls,
      authors: preview.authors,
    }
  }

  /** A release branch is created when free, reused when it already points at the source head. */
  private async releaseBranch(
    repo: string,
    name: string,
    sourceSha: string,
    blockers: string[],
  ): Promise<Draft['branch']> {
    const current = await this.releases.call(this.releases.client(true).branchHead(repo, name))
    if (!current) return { name, action: 'create' }
    if (current.sha === sourceSha) return { name, action: 'reuse' }
    blockers.push(
      `A branch ${name} já existe em ${repo} com outro conteúdo; o portal não escreve em branch existente.`,
    )
    return null
  }

  private async buildPublishPlan(
    request: ReleasePublishRequest,
    now: Date,
  ): Promise<ReleasePublishPlan> {
    const project = this.releases.project(request.project)
    if (!Object.values(project.repos).includes(request.repo)) {
      throw new BadRequestException(`${request.repo} não pertence ao projeto ${project.id}.`)
    }
    const runs = await this.requireStore().list({ projectId: project.id, limit: 200 })
    const opened = this.openedPulls(runs).some(
      (pull) => pull.repo === request.repo && pull.number === request.number,
    )
    if (!opened) {
      throw new NotFoundException(
        `A PR ${request.repo}#${request.number} não foi aberta pelo portal.`,
      )
    }
    const client = this.releases.client(true)
    const detail = await this.releases.call(client.pull(request.repo, request.number))
    const blockers: string[] = []
    const published = this.publishedPulls(runs).get(pullKey(request.repo, request.number))
    if (published) blockers.push(`A release já foi publicada como ${published.tag}.`)
    if (!detail.merged || !detail.mergedAt || !detail.mergeSha) {
      blockers.push(`A PR #${request.number} ainda não foi mergeada; a tag sai do commit do merge.`)
    }

    let tag = ''
    if (detail.mergedAt) {
      for (const candidate of releaseTagCandidates(
        releaseTagBase(detail.headRef, detail.mergedAt),
      )) {
        if (!(await this.releases.call(client.tagExists(request.repo, candidate)))) {
          tag = candidate
          break
        }
      }
      if (!tag) blockers.push('Todos os nomes de tag do dia já existem; crie a tag à mão.')
    }

    const sha = detail.mergeSha ?? ''
    const name = `Release ${tag.replace(/^release-/, '')}`.trim()
    const body = detail.body.replace(RELEASE_MARKER, '').trim()
    const steps: ReleaseWriteStep[] =
      blockers.length || !tag
        ? []
        : [
            { kind: 'create-tag', repo: request.repo, tag, sha },
            { kind: 'create-release', repo: request.repo, tag, name, body },
          ]
    return {
      kind: 'publish',
      project: { id: project.id, name: project.name },
      repo: request.repo,
      number: request.number,
      pullUrl: detail.url,
      tag,
      sha,
      name,
      body,
      generatedAt: now.toISOString(),
      steps,
      blockers,
      confirm: [request.repo],
      hash: planHash({ project: project.id, repo: request.repo, number: request.number, steps }),
      writeEnabled: this.config.releaseWrite.enabled,
    }
  }

  private openedPulls(runs: readonly StoredReleaseRun[]) {
    const seen = new Map<
      string,
      Pick<
        ReleaseTrackedPull,
        'lastRunId' | 'lastRunAt' | 'lastRunBy' | 'sides' | 'repo' | 'number' | 'url' | 'title'
      >
    >()
    for (const run of runs) {
      if (run.action !== 'release' || run.status === 'rejected') continue
      for (const pull of storedResult(run).pulls) {
        const key = pullKey(pull.repo, pull.number)
        if (seen.has(key)) continue
        seen.set(key, {
          lastRunId: run.id,
          lastRunAt: run.createdAt,
          lastRunBy: run.actor,
          sides: pull.sides,
          repo: pull.repo,
          number: pull.number,
          url: pull.url,
          title: '',
        })
      }
    }
    return [...seen.values()]
  }

  private publishedPulls(runs: readonly StoredReleaseRun[]) {
    const published = new Map<string, { tag: string; url: string }>()
    for (const run of runs) {
      if (run.action !== 'publish' || run.status !== 'success') continue
      const release = storedResult(run).release
      if (release) {
        published.set(pullKey(release.repo, release.number), { tag: release.tag, url: release.url })
      }
    }
    return published
  }

  private async runAndRecord(
    user: User,
    projectId: string,
    action: 'release' | 'publish',
    plan: ReleasePlan | ReleasePublishPlan,
    writer: GitHubWriter,
    context: RunContext,
  ): Promise<ReleaseExecuteResponse> {
    const result = await this.run(plan.steps, writer, context)
    const stored = await this.requireStore().record({
      projectId,
      action,
      actor: user.login,
      role: user.role,
      planHash: plan.hash,
      plan,
      status: result.status,
      result,
    })
    return { ...result, runId: stored.id }
  }

  private async run(
    steps: readonly ReleaseWriteStep[],
    writer: GitHubWriter,
    context: RunContext,
  ): Promise<ReleaseRunResult> {
    const result = emptyResult(steps.length)
    const numbers = new Map<string, { number: number; url: string }>()
    const pullOf = (repo: string) => context.pulls.find((pull) => pull.repo === repo)
    const numberOf = (repo: string) => {
      const found = numbers.get(repo)
      if (!found) throw new GitHubError(500, `Nenhuma PR de release conhecida em ${repo}.`)
      return found.number
    }

    const apply = async (step: ReleaseWriteStep) => {
      switch (step.kind) {
        case 'create-branch':
          await writer.createBranch(step.repo, step.branch, step.sha)
          result.branches.push({ repo: step.repo, name: step.branch })
          return
        case 'reuse-branch':
          return
        case 'create-pull': {
          const created = await writer.createPull(step.repo, step)
          numbers.set(step.repo, created)
          result.pulls.push({
            sides: pullOf(step.repo)?.sides ?? [],
            repo: step.repo,
            ...created,
            action: 'created',
          })
          return
        }
        case 'update-pull':
          await writer.updatePullBody(step.repo, step.number, step.body)
          numbers.set(step.repo, { number: step.number, url: step.url })
          result.pulls.push({
            sides: pullOf(step.repo)?.sides ?? [],
            repo: step.repo,
            number: step.number,
            url: step.url,
            action: 'updated',
          })
          return
        case 'add-labels':
          await writer.addLabels(step.repo, numberOf(step.repo), step.labels)
          return
        case 'add-assignees':
          await writer.addAssignees(step.repo, numberOf(step.repo), step.logins)
          return
        case 'link-pulls':
          for (const repo of step.repos) {
            const other = step.repos.find((candidate) => candidate !== repo) ?? repo
            const body = withLink(pullOf(repo)?.body ?? '', {
              sides: pullOf(other)?.sides ?? [],
              repo: other,
              pull: numbers.get(other) ?? null,
            })
            await writer.updatePullBody(repo, numberOf(repo), body)
          }
          return
        case 'create-tag':
          await writer.createTag(step.repo, step.tag, step.sha)
          return
        case 'create-release': {
          const release = await writer.createRelease(step.repo, step)
          result.release = {
            repo: step.repo,
            number: context.publishNumber ?? 0,
            tag: step.tag,
            url: release.url,
          }
          return
        }
      }
    }

    for (const step of steps) {
      try {
        await apply(step)
        result.completed += 1
      } catch (error) {
        result.status = 'failed'
        result.error = errorMessage(error)
        break
      }
    }
    return result
  }
}
