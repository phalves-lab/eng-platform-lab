import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type {
  ReleaseBranches,
  ReleasePreview,
  ReleasePreviewQuery,
  ReleaseProject,
  ReleaseSide,
  ReleaseSidePreview,
} from '@lab/contracts'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { TtlCache, withCache } from './cache.js'
import { loadReleaseCatalog } from './catalog.js'
import { GITHUB_CLIENT, type GitHubClient, GitHubError } from './github.js'
import {
  buildWarnings,
  deployOrder,
  findCutoff,
  findOpenRelease,
  groupByTicket,
  renderReleaseBranch,
  summarizeChecks,
  unionAuthors,
} from './rules.js'

const CACHE_TTL_MS = 60_000
const SIDES: ReleaseSide[] = ['front', 'back']

export const NO_TOKEN_MESSAGE =
  'Integração com o GitHub não configurada: defina PORTAL_GITHUB_TOKEN no ambiente da portal-api.'

export interface SideOptions {
  fresh?: boolean
  mergedBefore?: string | null
}

/** Read-only release preview: catalog, branches and what would go into the next release. */
@Injectable()
export class ReleasesService {
  private readonly catalog: ReleaseProject[]
  private readonly github: GitHubClient | null
  private readonly raw: GitHubClient | null

  constructor(
    @Inject(CONFIG) config: PortalConfig,
    @Inject(GITHUB_CLIENT) github: GitHubClient | null,
  ) {
    this.catalog = loadReleaseCatalog(config.releasesDir)
    this.raw = github
    this.github = github ? withCache(github, new TtlCache(CACHE_TTL_MS)) : null
  }

  projects(): ReleaseProject[] {
    return this.catalog
  }

  async branches(projectId: string, side: ReleaseSide): Promise<ReleaseBranches> {
    const project = this.project(projectId)
    const repo = this.repoOf(project, side)
    const branches = await this.call(this.client().branches(repo))
    return {
      side,
      repo,
      defaults: { source: project.source, target: project.target },
      branches: [...branches].sort((a, b) => a.localeCompare(b)),
    }
  }

  async preview(
    query: ReleasePreviewQuery,
    now = new Date(),
    options: SideOptions = {},
  ): Promise<ReleasePreview> {
    const project = this.project(query.project)
    const sides = query.side === 'both' ? SIDES.filter((side) => project.repos[side]) : [query.side]
    if (query.side === 'both' && sides.length < 2) {
      throw new BadRequestException(`O projeto ${project.id} só tem o lado ${sides.join(', ')}.`)
    }
    const source = query.source ?? project.source
    const target = query.target ?? project.target
    if (source === target) throw new BadRequestException('Origem e destino iguais.')

    const previews = await Promise.all(
      sides.map((side) => this.previewSide(project, side, source, target, now, options)),
    )
    const back = previews.find((preview) => preview.side === 'back')
    return {
      project: { id: project.id, name: project.name, mode: project.mode },
      side: query.side,
      generatedAt: now.toISOString(),
      sides: previews,
      authors: unionAuthors(previews.flatMap((preview) => preview.authors)),
      deployOrder: previews.length > 1 ? deployOrder(project, back?.tickets ?? []) : null,
    }
  }

  /**
   * Preview of one side. `mergedBefore` keeps only PRs merged up to that instant, which is what an
   * existing release branch cut at that moment really contains.
   */
  async previewSide(
    project: ReleaseProject,
    side: ReleaseSide,
    source: string,
    target: string,
    now: Date,
    options: SideOptions = {},
  ): Promise<ReleaseSidePreview> {
    const repo = this.repoOf(project, side)
    const github = this.client(options.fresh)
    const [compare, intoTarget, runs, open] = await this.call(
      Promise.all([
        github.compare(repo, target, source),
        github.mergedPulls(repo, target, null),
        github.checkRuns(repo, source),
        github.openPulls(repo, target),
      ]),
    )
    let cutoff = findCutoff(project, source, intoTarget, [])
    if (cutoff.kind === 'none') {
      cutoff = findCutoff(project, source, intoTarget, await this.call(github.tags(repo)))
    }
    const merged = await this.call(github.mergedPulls(repo, source, cutoff.at))
    const ceiling = options.mergedBefore
    const pulls = ceiling ? merged.filter((pull) => (pull.mergedAt ?? '') <= ceiling) : merged
    const tickets = groupByTicket(pulls, project.ticketUrl)
    const found = findOpenRelease(project, source, open)
    const openRelease = found
      ? { ...found, mergeable: await this.call(github.mergeable(repo, found.number)) }
      : null
    const checks = summarizeChecks(runs)
    return {
      side,
      repo,
      source,
      target,
      aheadBy: compare.aheadBy,
      behindBy: compare.behindBy,
      cutoff,
      pulls: pulls.length,
      tickets,
      authors: unionAuthors(tickets.flatMap((ticket) => ticket.authors)),
      checks,
      openRelease,
      releaseBranch:
        project.mode === 'branch' ? renderReleaseBranch(project.releaseBranch, now) : null,
      warnings: buildWarnings({
        source,
        target,
        compare,
        pulls: pulls.length,
        cutoff,
        checks,
        openRelease,
      }),
    }
  }

  project(id: string): ReleaseProject {
    const project = this.catalog.find((candidate) => candidate.id === id)
    if (!project) throw new NotFoundException(`Projeto de release ${id} não encontrado.`)
    return project
  }

  repoOf(project: ReleaseProject, side: ReleaseSide): string {
    const repo = project.repos[side]
    if (!repo) {
      throw new BadRequestException(`O projeto ${project.id} não tem o lado ${side} cadastrado.`)
    }
    return repo
  }

  /** Cached reader for screens; `fresh` skips the cache, as a write must see GitHub as it is now. */
  client(fresh = false): GitHubClient {
    const client = fresh ? this.raw : this.github
    if (!client) throw new ServiceUnavailableException(NO_TOKEN_MESSAGE)
    return client
  }

  async call<T>(promise: Promise<T>): Promise<T> {
    try {
      return await promise
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error
      if (error.status === 404 || error.status === 422) {
        throw new NotFoundException('Repositório ou branch não encontrado no GitHub.')
      }
      if (error.status === 401) {
        throw new ServiceUnavailableException('O token do GitHub foi recusado (401).')
      }
      if (error.status === 429) {
        throw new ServiceUnavailableException(
          'Limite de requisições do GitHub atingido. Tente de novo em alguns minutos.',
        )
      }
      if (error.status === 403) {
        throw new ServiceUnavailableException(
          'O token do GitHub não tem acesso a este repositório.',
        )
      }
      throw new BadGatewayException(error.message)
    }
  }
}
