import { readFile } from 'node:fs/promises'
import type { GatewaySpend } from '@lab/contracts'
import { z } from 'zod'
import type { PortalConfig } from '../config/config.js'
import type { Clock } from './clock.js'

export const GATEWAY_SPEND = Symbol('GATEWAY_SPEND')

/** Reads the spend of the portal virtual key on the model gateway. */
export interface GatewaySpendSource {
  read: () => Promise<GatewaySpend>
}

/** Subset of the LiteLLM `GET /key/info` answer the portal uses; the key itself is never kept. */
export const KeyInfoSchema = z.object({
  info: z.object({
    key_alias: z.string().nullish(),
    spend: z.number().nonnegative(),
    max_budget: z.number().nonnegative().nullish(),
    budget_reset_at: z.iso.datetime({ offset: true }).nullish(),
  }),
})

export const toGatewaySpend = (
  body: unknown,
  source: GatewaySpend['source'],
  readAt: Date,
): GatewaySpend => {
  const { info } = KeyInfoSchema.parse(body)
  return {
    source,
    keyAlias: info.key_alias ?? 'sem apelido',
    spendUsd: info.spend,
    maxBudgetUsd: info.max_budget ?? null,
    budgetResetAt: info.budget_reset_at ? new Date(info.budget_reset_at).toISOString() : null,
    readAt: readAt.toISOString(),
  }
}

/**
 * Lab adapter of the gateway port: answers from a `/key/info` fixture and never calls LiteLLM.
 * A real adapter only needs to fetch the same endpoint and reuse `toGatewaySpend`.
 */
export class FakeGatewaySpendSource implements GatewaySpendSource {
  constructor(
    private readonly file: string,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<GatewaySpend> {
    const body: unknown = JSON.parse(await readFile(this.file, 'utf8'))
    return toGatewaySpend(body, 'fake', this.clock())
  }
}

export const createGatewaySpendSource = (
  config: PortalConfig,
  clock: Clock,
): GatewaySpendSource | null =>
  config.ai.gatewaySpend.kind === 'fake'
    ? new FakeGatewaySpendSource(config.ai.gatewaySpend.file, clock)
    : null
