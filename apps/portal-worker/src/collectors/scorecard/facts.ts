import type { RepoCatalogEntry } from '@lab/contracts'
import { z } from 'zod'

const AlertCountsSchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
})
export type AlertCounts = z.infer<typeof AlertCountsSchema>

/**
 * Protection of one branch merged from rulesets and classic protection. `unknown` means the
 * classic endpoint was not readable and the rulesets alone did not cover every rule.
 */
const BranchFactsSchema = z.object({
  name: z.string().min(1),
  exists: z.boolean(),
  protection: z.enum(['ruleset', 'classic', 'both', 'none', 'unknown']),
  requiresPullRequest: z.boolean(),
  blocksForcePush: z.boolean(),
  blocksDeletion: z.boolean(),
  mergeQueue: z.boolean(),
})
export type BranchFacts = z.infer<typeof BranchFactsSchema>

/** What a source read about one repository; `null` marks data the token could not read. */
export const RepoFactsSchema = z.object({
  defaultBranch: z.string().min(1),
  branches: z.array(BranchFactsSchema),
  workflows: z.array(z.object({ path: z.string().min(1), content: z.string() })),
  agentsMd: z.object({ present: z.boolean(), updatedAt: z.iso.datetime().nullable() }),
  nvmrc: z.string().nullable(),
  secretScanning: z.object({
    secretScanning: z.boolean().nullable(),
    pushProtection: z.boolean().nullable(),
  }),
  dependabotAlerts: AlertCountsSchema.nullable(),
  codeScanning: z
    .discriminatedUnion('enabled', [
      z.object({ enabled: z.literal(false) }),
      z.object({ enabled: z.literal(true), alerts: AlertCountsSchema }),
    ])
    .nullable(),
  labels: z.array(z.string()),
})
export type RepoFacts = z.infer<typeof RepoFactsSchema>

/** Port of the scorecard collector: reads the facts of one repository, never writes anything. */
export interface RepoSource {
  facts: (entry: RepoCatalogEntry) => Promise<RepoFacts>
}

export const emptyAlerts = (): AlertCounts => ({ critical: 0, high: 0, medium: 0, low: 0 })
