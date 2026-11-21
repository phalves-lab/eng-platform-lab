import type { Handbook } from './handbook.js'

export type ReviewStatus = 'ok' | 'expiring' | 'stale' | 'missing'

export interface ReviewItem {
  kind: 'document' | 'standard'
  ref: string
  title: string
  file: string
  owner: string | null
  reviewedAt: string | null
}

export interface ReviewState extends ReviewItem {
  dueAt: string | null
  ageDays: number | null
  status: ReviewStatus
}

export interface ReviewOptions {
  now: Date
  maxAgeMonths: number
  expiringDays?: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
const DEFAULT_EXPIRING_DAYS = 30

const toDate = (value: string | undefined): string | null => {
  const match = ISO_DATE.exec(value?.trim() ?? '')
  if (!match) return null
  const date = new Date(`${match[0]}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === match[0] ? match[0] : null
}

const toOwner = (value: string | undefined): string | null => {
  const owner = value?.replace(/`/g, '').trim()
  return owner ? owner : null
}

const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** Adds calendar months in UTC, clamping to the last day when the target month is shorter. */
export const addMonths = (iso: string, months: number): string => {
  const start = utcDay(iso)
  const target = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months + 1, 0),
  ).getUTCDate()
  const date = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + months,
      Math.min(start.getUTCDate(), target),
    ),
  )
  return date.toISOString().slice(0, 10)
}

/**
 * Review metadata of every handbook file (frontmatter `dono` and `revisado_em`) plus the standards
 * that declare their own `Dono` or `Revisado em` field; a missing half is inherited from the file.
 */
export const reviewItems = (handbook: Handbook): ReviewItem[] => {
  const documents: ReviewItem[] = handbook.documents.map((document) => ({
    kind: 'document',
    ref: document.file,
    title: document.title,
    file: document.file,
    owner: toOwner(document.frontmatter['dono']),
    reviewedAt: toDate(document.frontmatter['revisado_em']),
  }))
  const standards: ReviewItem[] = handbook.standards
    .filter((standard) => standard.fields['Dono'] ?? standard.fields['Revisado em'])
    .map((standard) => {
      const file = standard.source.split(' › ')[0] ?? ''
      const parent = documents.find((document) => document.file === file)
      return {
        kind: 'standard',
        ref: standard.id,
        title: `${standard.id} · ${standard.title}`,
        file,
        owner: toOwner(standard.fields['Dono']) ?? parent?.owner ?? null,
        reviewedAt: toDate(standard.fields['Revisado em']) ?? parent?.reviewedAt ?? null,
      }
    })
  return [...documents, ...standards]
}

const statusOf = (item: ReviewItem, daysLeft: number, expiringDays: number): ReviewStatus => {
  if (!item.owner) return 'missing'
  if (daysLeft < 0) return 'stale'
  return daysLeft <= expiringDays ? 'expiring' : 'ok'
}

/** Classifies an item: stale after `maxAgeMonths`, expiring in the days before, missing without owner or date. */
export const assessReview = (item: ReviewItem, options: ReviewOptions): ReviewState => {
  if (!item.reviewedAt) return { ...item, dueAt: null, ageDays: null, status: 'missing' }
  const today = utcDay(options.now.toISOString().slice(0, 10)).getTime()
  const dueAt = addMonths(item.reviewedAt, options.maxAgeMonths)
  const ageDays = Math.floor((today - utcDay(item.reviewedAt).getTime()) / DAY_MS)
  const daysLeft = Math.round((utcDay(dueAt).getTime() - today) / DAY_MS)
  const expiringDays = options.expiringDays ?? DEFAULT_EXPIRING_DAYS
  return { ...item, dueAt, ageDays, status: statusOf(item, daysLeft, expiringDays) }
}
