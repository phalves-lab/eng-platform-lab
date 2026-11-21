import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type {
  RepoScorecard,
  RepoScorecardView,
  ScorecardFilter,
  ScorecardResponse,
  ScoreLevel,
} from '@lab/contracts'
import { findStandard, normalize } from '@lab/handbook'
import { HandbookService } from '../handbook/handbook.service.js'
import { SCORECARD_SOURCE, type ScorecardSource } from './scorecard-source.js'

const matches = (repo: RepoScorecard, filter: ScorecardFilter) => {
  if (filter.level && repo.level !== filter.level) return false
  if (!filter.term) return true
  const term = normalize(filter.term)
  return [repo.id, repo.repo, repo.name, repo.team].some((value) => normalize(value).includes(term))
}

const average = (values: number[]) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null

/** Serves the collected scorecard with the title of the handbook standard behind each check. */
@Injectable()
export class ScorecardService {
  constructor(
    @Inject(SCORECARD_SOURCE) private readonly source: ScorecardSource,
    private readonly handbook: HandbookService,
  ) {}

  private view(repo: RepoScorecard): RepoScorecardView {
    const handbook = this.handbook.snapshot()
    return {
      ...repo,
      checks: repo.checks.map((check) => ({
        ...check,
        standardTitle: findStandard(handbook, check.standardId)?.title ?? null,
      })),
    }
  }

  async list(filter: ScorecardFilter): Promise<ScorecardResponse> {
    const report = await this.source.load()
    const levels: Record<ScoreLevel, number> = { good: 0, attention: 0, critical: 0, unknown: 0 }
    for (const repo of report.repos) levels[repo.level] += 1
    const scores = report.repos.flatMap((repo) => (repo.score === null ? [] : [repo.score]))
    return {
      generatedAt: report.generatedAt,
      total: report.repos.length,
      averageScore: average(scores),
      levels,
      repos: report.repos.filter((repo) => matches(repo, filter)).map((repo) => this.view(repo)),
    }
  }

  async repo(id: string): Promise<RepoScorecardView> {
    const report = await this.source.load()
    const found = report.repos.find((repo) => repo.id === id)
    if (!found) throw new NotFoundException(`Repositório ${id} não está no scorecard`)
    return this.view(found)
  }
}
