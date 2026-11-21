import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { DoraMetricsResponse, DoraQuery } from '@lab/contracts'
import { type DoraRepo, DoraFilterError, computeDora, windowStart } from '@lab/dora'
import { DORA_SOURCE, type DoraSource } from './dora-source.js'

export const DORA_CATALOG = Symbol('DORA_CATALOG')

const DAY = 86_400_000
const CHANGE_LOOKBACK_DAYS = 90

/** Serves the DORA metrics of the catalog repositories, computed on every request. */
@Injectable()
export class DoraService {
  constructor(
    @Inject(DORA_CATALOG) private readonly repos: DoraRepo[],
    @Inject(DORA_SOURCE) private readonly source: DoraSource,
  ) {}

  async metrics(query: DoraQuery, now = new Date()): Promise<DoraMetricsResponse> {
    const from = windowStart(now.getTime(), query.weeks)
    const data = await this.source.load({
      deploysSince: new Date(from).toISOString(),
      changesSince: new Date(from - CHANGE_LOOKBACK_DAYS * DAY).toISOString(),
      incidentsSince: new Date(from).toISOString(),
    })
    try {
      return computeDora({
        repos: this.repos,
        ...data,
        now: now.toISOString(),
        weeks: query.weeks,
        filter: { team: query.team, repo: query.repo },
      })
    } catch (error) {
      if (error instanceof DoraFilterError) throw new NotFoundException(error.message)
      throw error
    }
  }
}
