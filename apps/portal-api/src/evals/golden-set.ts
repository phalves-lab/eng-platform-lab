import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTool } from '@lab/handbook'
import { parse } from 'yaml'
import { z } from 'zod'

export const GOLDEN_SET_DIR = fileURLToPath(
  new URL('../../../../review/chat-golden', import.meta.url),
)

export const CATEGORIES = [
  'padroes',
  'sistemas',
  'glossario',
  'decisoes',
  'onboarding',
  'sem-resposta',
  'fora-do-escopo',
] as const

const ToolNameSchema = z
  .string()
  .refine((name) => findTool(name) !== null, { message: 'unknown handbook tool' })

/** One expected phrase or source, or a list of accepted alternatives for it. */
const AlternativesSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])

const ScriptedCallSchema = z
  .object({ tool: ToolNameSchema, args: z.record(z.string(), z.unknown()).default({}) })
  .strict()

const GoldenCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    question: z.string().trim().min(3).max(500),
    expect: z
      .object({
        tools: z.array(ToolNameSchema).default([]),
        sources: z.array(AlternativesSchema).default([]),
        include: z.array(AlternativesSchema).default([]),
        exclude: z.array(z.string().min(1)).default([]),
        hiddenFromModel: z.array(z.string().min(1)).default([]),
      })
      .strict(),
    offline: z
      .object({ calls: z.array(ScriptedCallSchema).default([]), answer: z.string().min(1) })
      .strict(),
  })
  .strict()

const GoldenFileSchema = z
  .object({ category: z.enum(CATEGORIES), cases: z.array(GoldenCaseSchema).min(1) })
  .strict()

export type Alternatives = z.infer<typeof AlternativesSchema>
export type OfflineScript = z.infer<typeof GoldenCaseSchema>['offline']
export type GoldenCase = z.infer<typeof GoldenCaseSchema> & {
  category: (typeof CATEGORIES)[number]
}

/** Reads every YAML file of the chat golden set and fails on invalid or repeated cases. */
export const loadGoldenSet = async (directory = GOLDEN_SET_DIR): Promise<GoldenCase[]> => {
  const files = (await readdir(directory)).filter((file) => /\.ya?ml$/.test(file)).sort()
  const cases: GoldenCase[] = []
  for (const file of files) {
    const parsed = GoldenFileSchema.safeParse(parse(await readFile(join(directory, file), 'utf8')))
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      throw new Error(`Invalid golden set file ${file}: ${issues.join('; ')}`)
    }
    for (const golden of parsed.data.cases)
      cases.push({ ...golden, category: parsed.data.category })
  }
  const ids = cases.map((golden) => golden.id)
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index)
  if (repeated) throw new Error(`Repeated golden case id: ${repeated}`)
  return cases
}
