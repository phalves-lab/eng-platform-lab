import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'

export interface CatalogFile<T> {
  file: string
  value: T
}

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

const yamlFiles = (directory: string): string[] => {
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort()
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

/** File name without the YAML extension, which catalogs use as the entry id. */
export const stem = (file: string) => basename(file, extname(file))

/**
 * Reads and validates every YAML file of a versioned catalog folder. A missing folder is an
 * empty catalog; an invalid file fails with its name so the API never boots half configured.
 */
export const loadYamlCatalog = <S extends z.ZodType>(
  directory: string,
  schema: S,
  label: string,
): CatalogFile<z.infer<S>>[] =>
  yamlFiles(directory).map((file) => {
    const parsed = schema.safeParse(parse(readFileSync(join(directory, file), 'utf8')))
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ')
      throw new Error(`${label} inválido em ${file}: ${issues}`)
    }
    return { file, value: parsed.data }
  })
