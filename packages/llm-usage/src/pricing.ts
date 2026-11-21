import { readFile } from 'node:fs/promises'
import type { AiUsageRecord } from '@lab/contracts'
import { parse } from 'yaml'
import { z } from 'zod'

export class AiConfigError extends Error {
  override readonly name = 'AiConfigError'
}

const PriceSchema = z.number().nonnegative().max(1_000)

const ModelPriceSchema = z.object({
  model: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'model sem prefixo de provedor'),
  inputPerMillion: PriceSchema,
  outputPerMillion: PriceSchema,
})

export const PricingSchema = z
  .object({
    version: z.string().trim().min(1),
    currency: z.literal('USD'),
    models: z.array(ModelPriceSchema).min(1),
  })
  .refine(
    (pricing) => new Set(pricing.models.map((entry) => entry.model)).size === pricing.models.length,
    'modelo repetido na tabela de preço',
  )
export type Pricing = z.infer<typeof PricingSchema>

export const QualityConfigSchema = z.object({
  precision: z.object({
    bot: z.number().min(0).max(1),
    chat: z.number().min(0).max(1),
  }),
})
export type QualityConfig = z.infer<typeof QualityConfigSchema>

const loadYaml = async <T>(file: string, schema: z.ZodType<T>): Promise<T> => {
  const parsed = schema.safeParse(parse(await readFile(file, 'utf8')))
  if (!parsed.success) {
    throw new AiConfigError(
      `${file} inválido: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  return parsed.data
}

/** Versioned price table of `catalog/ai/pricing.yaml`, in US dollars per million tokens. */
export const loadPricing = (file: string) => loadYaml(file, PricingSchema)

/** Precision thresholds of `catalog/ai/quality.yaml`, one per golden set. */
export const loadQualityConfig = (file: string) => loadYaml(file, QualityConfigSchema)

const baseModel = (model: string) => model.trim().toLowerCase().split('/').at(-1) ?? ''

/**
 * Price entry of a model id. Gateway prefixes (`models/`, `gemini/`) are dropped, and a dated or
 * preview id falls back to the longest listed model it starts with.
 */
export const findPrice = (pricing: Pricing, model: string) => {
  const target = baseModel(model)
  const exact = pricing.models.find((entry) => entry.model === target)
  if (exact) return exact
  return (
    pricing.models
      .filter((entry) => target.startsWith(`${entry.model}-`))
      .sort((a, b) => b.model.length - a.model.length)
      .at(0) ?? null
  )
}

const MILLION = 1_000_000

export const roundUsd = (value: number) => Math.round(value * MILLION) / MILLION

/** Estimated cost in US dollars, or null when the model is not in the price table. */
export const estimateCost = (
  pricing: Pricing,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null => {
  const price = findPrice(pricing, model)
  if (!price) return null
  return roundUsd(
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / MILLION,
  )
}

/** Fills the cost of a record that arrived with tokens only; a priced record is kept as is. */
export const priceRecord = (pricing: Pricing, record: AiUsageRecord): AiUsageRecord => {
  if (record.costUsd !== null) return record
  const costUsd = estimateCost(pricing, record.model, record.inputTokens, record.outputTokens)
  return { ...record, costUsd, pricingVersion: costUsd === null ? null : pricing.version }
}
