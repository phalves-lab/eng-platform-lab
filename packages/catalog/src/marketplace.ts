import { join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import {
  CatalogError,
  listDirectories,
  parseFrontmatter,
  parseJson,
  readOptional,
  readRequired,
  validate,
} from './files.js'

const AuthorSchema = z.union([
  z.string().min(1),
  z.looseObject({ name: z.string().min(1) }).transform((author) => author.name),
])

const MarketplaceEntrySchema = z.looseObject({
  name: z.string().min(1),
  source: z.union([z.string().min(1), z.looseObject({ source: z.string().min(1) })]),
  description: z.string().optional(),
  version: z.string().optional(),
  author: AuthorSchema.optional(),
  keywords: z.array(z.string()).optional(),
})

const MarketplaceSchema = z.looseObject({
  name: z.string().min(1),
  metadata: z.looseObject({ pluginRoot: z.string().optional() }).optional(),
  plugins: z.array(MarketplaceEntrySchema),
})

const PluginManifestSchema = z.looseObject({
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: AuthorSchema.optional(),
  keywords: z.array(z.string()).optional(),
})

const SkillFrontmatterSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().min(1),
})

export interface MarketplaceSkill {
  name: string
  description: string
}

export interface MarketplacePlugin {
  name: string
  displayName: string
  description: string
  version: string | null
  author: string | null
  keywords: string[]
  skills: MarketplaceSkill[]
}

export interface Marketplace {
  name: string
  plugins: MarketplacePlugin[]
}

const MANIFEST = join('.claude-plugin', 'marketplace.json')
const PLUGIN_MANIFEST = join('.claude-plugin', 'plugin.json')

/** Resolves a relative plugin source and refuses paths that leave the marketplace folder. */
const pluginDirectory = (root: string, pluginRoot: string | undefined, source: string) => {
  const directory = resolve(root, pluginRoot ?? '', source)
  if (directory !== root && !directory.startsWith(`${root}${sep}`)) {
    throw new CatalogError(`plugin com source fora do marketplace: ${source}`)
  }
  return directory
}

const readSkills = async (root: string, directory: string): Promise<MarketplaceSkill[]> => {
  const skillsDir = join(directory, 'skills')
  const names = await listDirectories(skillsDir)
  const skills = await Promise.all(
    names.map(async (name) => {
      const path = join(skillsDir, name, 'SKILL.md')
      const file = relative(root, path)
      const text = await readOptional(path)
      if (text === null) return null
      const frontmatter = parseFrontmatter(text, file)
      if (frontmatter === null) throw new CatalogError(`${file} sem frontmatter`)
      const { name: skillName, description } = validate(SkillFrontmatterSchema, frontmatter, file)
      return { name: skillName, description }
    }),
  )
  return skills.filter((skill): skill is MarketplaceSkill => skill !== null)
}

const readPlugin = async (
  root: string,
  pluginRoot: string | undefined,
  entry: z.infer<typeof MarketplaceEntrySchema>,
): Promise<MarketplacePlugin> => {
  const fallback = {
    name: entry.name,
    displayName: entry.name,
    description: entry.description ?? '',
    version: entry.version ?? null,
    author: entry.author ?? null,
    keywords: entry.keywords ?? [],
    skills: [],
  }
  if (typeof entry.source !== 'string') return fallback

  const directory = pluginDirectory(root, pluginRoot, entry.source)
  const manifestPath = join(directory, PLUGIN_MANIFEST)
  const file = relative(root, manifestPath)
  const text = await readOptional(manifestPath)
  const manifest =
    text === null ? null : validate(PluginManifestSchema, parseJson(text, file), file)

  return {
    ...fallback,
    displayName: manifest?.displayName ?? fallback.displayName,
    description: manifest?.description ?? fallback.description,
    version: manifest?.version ?? fallback.version,
    author: manifest?.author ?? fallback.author,
    keywords: manifest?.keywords ?? fallback.keywords,
    skills: await readSkills(root, directory),
  }
}

/**
 * Reads a Claude Code plugin marketplace from disk: `.claude-plugin/marketplace.json`, each
 * local plugin's `plugin.json` and its `skills/<name>/SKILL.md` frontmatter. Plugins whose
 * source is remote are listed from the marketplace entry alone, without skills.
 */
export const readMarketplace = async (directory: string): Promise<Marketplace> => {
  const root = resolve(directory)
  const text = await readRequired(join(root, MANIFEST), root)
  const manifest = validate(MarketplaceSchema, parseJson(text, MANIFEST), MANIFEST)
  const plugins = await Promise.all(
    manifest.plugins.map((entry) => readPlugin(root, manifest.metadata?.pluginRoot, entry)),
  )
  return { name: manifest.name, plugins }
}
