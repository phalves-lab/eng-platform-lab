import { Inject, Injectable } from '@nestjs/common'
import type { DocOwnerGroup, DocReviewItem, DocReviewStatus, DocsReport } from '@lab/contracts'
import { assessReview, reviewItems } from '@lab/handbook'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { CLOCK, type Clock } from './clock.js'

const STATUS_ORDER: DocReviewStatus[] = ['stale', 'missing', 'expiring', 'ok']

const emptyCounts = (): Record<DocReviewStatus, number> => ({
  ok: 0,
  expiring: 0,
  stale: 0,
  missing: 0,
})

const countOf = (items: DocReviewItem[]) => {
  const counts = emptyCounts()
  for (const item of items) counts[item.status] += 1
  return counts
}

const byUrgency = (a: DocReviewItem, b: DocReviewItem) =>
  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
  (a.dueAt ?? '').localeCompare(b.dueAt ?? '') ||
  a.ref.localeCompare(b.ref)

/** Owners with the most overdue items come first; items without an owner close the list. */
const byOwnerAlerts = (a: DocOwnerGroup, b: DocOwnerGroup) =>
  Number(a.owner === null) - Number(b.owner === null) ||
  b.counts.stale + b.counts.missing - (a.counts.stale + a.counts.missing) ||
  (a.owner ?? '').localeCompare(b.owner ?? '')

/** Review freshness of the handbook, grouped by owner, from the handbook already loaded at boot. */
@Injectable()
export class DocsService {
  constructor(
    @Inject(CONFIG) private readonly config: PortalConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly handbook: HandbookService,
  ) {}

  report(months?: number): DocsReport {
    const now = this.clock()
    const maxAgeMonths = months ?? this.config.docsMaxAgeMonths
    const items: DocReviewItem[] = reviewItems(this.handbook.snapshot())
      .map((item) => assessReview(item, { now, maxAgeMonths }))
      .sort(byUrgency)
    const groups = new Map<string | null, DocReviewItem[]>()
    for (const item of items) groups.set(item.owner, [...(groups.get(item.owner) ?? []), item])
    const owners = [...groups.entries()]
      .map(([owner, list]) => ({ owner, items: list, counts: countOf(list) }))
      .sort(byOwnerAlerts)
    return { generatedAt: now.toISOString(), maxAgeMonths, counts: countOf(items), owners }
  }
}
