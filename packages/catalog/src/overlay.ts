import { join } from 'node:path'
import { z } from 'zod'
import { parseYamlText, readRequired, validate } from './files.js'

export const MATURITIES = ['draft', 'pilot', 'approved'] as const
export const MCP_SCOPES = ['read', 'write'] as const
export const MCP_CLIENTS = ['claude-code', 'kiro', 'cursor'] as const

const Handle = z.string().trim().min(1)
const ReviewDate = z.iso.date()

const uniqueNames = <T extends { name: string }>(items: T[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.name)) {
      ctx.addIssue({ code: 'custom', path: [index, 'name'], message: `${item.name} repetido` })
    }
    seen.add(item.name)
  })
}

const PluginOverlaySchema = z.object({
  marketplace: z.object({ source: z.string().trim().min(1) }),
  plugins: z
    .array(
      z.object({
        name: z.string().min(1),
        maturity: z.enum(MATURITIES),
        owner: Handle,
        reviewedAt: ReviewDate,
      }),
    )
    .default([])
    .superRefine(uniqueNames),
})
export type PluginOverlay = z.infer<typeof PluginOverlaySchema>

const InstallSchema = z.object({
  language: z.enum(['bash', 'json']),
  file: z.string().min(1).optional(),
  snippet: z.string().trim().min(1),
})

const McpOverlaySchema = z.object({
  mcps: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        scope: z.enum(MCP_SCOPES),
        accesses: z.array(z.string().min(1)).min(1),
        cautions: z.array(z.string().min(1)).default([]),
        owner: Handle,
        reviewedAt: ReviewDate,
        install: z
          .partialRecord(z.enum(MCP_CLIENTS), InstallSchema)
          .refine((install) => Object.keys(install).length > 0, 'informe ao menos um cliente'),
      }),
    )
    .superRefine(uniqueNames),
})
export type McpOverlay = z.infer<typeof McpOverlaySchema>

const PLUGINS_FILE = 'plugins.yaml'
const MCPS_FILE = 'mcps.yaml'

/** Reads the versioned overlay (`plugins.yaml` and `mcps.yaml`) kept next to the portal. */
export const readOverlay = async (directory: string) => {
  const [plugins, mcps] = await Promise.all(
    [PLUGINS_FILE, MCPS_FILE].map(async (file) =>
      parseYamlText(await readRequired(join(directory, file), directory), file),
    ),
  )
  return {
    plugins: validate(PluginOverlaySchema, plugins, PLUGINS_FILE),
    mcps: validate(McpOverlaySchema, mcps, MCPS_FILE),
  }
}
