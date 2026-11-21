import { type MarketplacePlugin, readMarketplace } from './marketplace.js'
import {
  MATURITIES,
  MCP_CLIENTS,
  type McpOverlay,
  type PluginOverlay,
  readOverlay,
} from './overlay.js'

export type Maturity = (typeof MATURITIES)[number]
export type McpScope = McpOverlay['mcps'][number]['scope']
export type McpClient = (typeof MCP_CLIENTS)[number]

export interface CatalogPlugin extends MarketplacePlugin {
  maturity: Maturity
  owner: string | null
  reviewedAt: string | null
  install: { marketplace: string; commands: string[] }
}

export interface CatalogMcp {
  name: string
  description: string
  scope: McpScope
  accesses: string[]
  cautions: string[]
  owner: string
  reviewedAt: string
  install: { client: McpClient; language: 'bash' | 'json'; file: string | null; snippet: string }[]
}

export interface AiCatalog {
  marketplace: { name: string; source: string }
  plugins: CatalogPlugin[]
  mcps: CatalogMcp[]
  warnings: string[]
}

export interface CatalogDirectories {
  marketplaceDir: string
  overlayDir: string
}

const MATURITY_RANK: Record<Maturity, number> = { approved: 0, pilot: 1, draft: 2 }

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const mergePlugins = (
  plugins: MarketplacePlugin[],
  overlay: PluginOverlay,
  marketplace: AiCatalog['marketplace'],
): CatalogPlugin[] => {
  const byName = new Map(overlay.plugins.map((entry) => [entry.name, entry]))
  return plugins
    .map((plugin) => {
      const entry = byName.get(plugin.name)
      return {
        ...plugin,
        maturity: entry?.maturity ?? 'draft',
        owner: entry?.owner ?? null,
        reviewedAt: entry?.reviewedAt ?? null,
        install: {
          marketplace: marketplace.name,
          commands: [
            `/plugin marketplace add ${marketplace.source}`,
            `/plugin install ${plugin.name}@${marketplace.name}`,
          ],
        },
      }
    })
    .sort(
      (a, b) =>
        MATURITY_RANK[a.maturity] - MATURITY_RANK[b.maturity] ||
        a.displayName.localeCompare(b.displayName, 'pt-BR'),
    )
}

const toMcps = (overlay: McpOverlay): CatalogMcp[] =>
  overlay.mcps.map(({ install, ...mcp }) => ({
    ...mcp,
    install: MCP_CLIENTS.flatMap((client) => {
      const entry = install[client]
      return entry
        ? [{ client, language: entry.language, file: entry.file ?? null, snippet: entry.snippet }]
        : []
    }),
  }))

/**
 * Joins the plugin marketplace with the portal overlay. A plugin missing from the overlay is
 * shown as draft with no owner; an overlay entry with no plugin behind it becomes a warning.
 */
export const loadAiCatalog = async ({
  marketplaceDir,
  overlayDir,
}: CatalogDirectories): Promise<AiCatalog> => {
  const [marketplace, overlay] = await Promise.all([
    readMarketplace(marketplaceDir),
    readOverlay(overlayDir),
  ])
  const info = { name: marketplace.name, source: overlay.plugins.marketplace.source }
  const known = new Set(marketplace.plugins.map((plugin) => plugin.name))
  return {
    marketplace: info,
    plugins: mergePlugins(marketplace.plugins, overlay.plugins, info),
    mcps: toMcps(overlay.mcps),
    warnings: overlay.plugins.plugins
      .filter((entry) => !known.has(entry.name))
      .map((entry) => `plugins.yaml cita ${entry.name}, que não existe no marketplace`),
  }
}

export interface PluginFilter {
  term?: string | undefined
  maturity?: Maturity | undefined
}

const searchableText = (plugin: CatalogPlugin) =>
  normalize(
    [
      plugin.name,
      plugin.displayName,
      plugin.description,
      ...plugin.keywords,
      ...plugin.skills.flatMap((skill) => [skill.name, skill.description]),
    ].join(' '),
  )

export const filterPlugins = (catalog: AiCatalog, filter: PluginFilter) => {
  const term = filter.term ? normalize(filter.term.trim()) : null
  return catalog.plugins.filter(
    (plugin) =>
      (!filter.maturity || plugin.maturity === filter.maturity) &&
      (!term || searchableText(plugin).includes(term)),
  )
}

export const findPlugin = (catalog: AiCatalog, name: string) => {
  const target = name.trim().toLowerCase()
  return catalog.plugins.find((plugin) => plugin.name.toLowerCase() === target) ?? null
}
