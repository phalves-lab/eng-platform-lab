import { readFile, readdir } from 'node:fs/promises'
import { relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ZodType } from 'zod'

export class CatalogError extends Error {
  override readonly name = 'CatalogError'
}

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

const describeIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues
    .map((issue) => `${issue.path.map(String).join('.') || '(raiz)'}: ${issue.message}`)
    .join('; ')

/** Validates parsed content, naming the file and the failing fields in the error. */
export const validate = <T>(schema: ZodType<T>, value: unknown, file: string): T => {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new CatalogError(`${file} inválido: ${describeIssues(result.error.issues)}`)
  return result.data
}

/** Reads a text file, answering null when it does not exist. */
export const readOptional = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

export const readRequired = async (path: string, root: string): Promise<string> => {
  const text = await readOptional(path)
  if (text === null) throw new CatalogError(`${relative(root, path) || path} não encontrado`)
  return text
}

export const listDirectories = async (path: string): Promise<string[]> => {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

export const parseJson = (text: string, file: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new CatalogError(`${file} não é JSON válido: ${messageOf(error)}`)
  }
}

export const parseYamlText = (text: string, file: string): unknown => {
  try {
    return parseYaml(text)
  } catch (error) {
    throw new CatalogError(`${file} não é YAML válido: ${messageOf(error)}`)
  }
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Extracts the YAML frontmatter at the top of a markdown file, or null when there is none. */
export const parseFrontmatter = (text: string, file: string): unknown => {
  const match = FRONTMATTER.exec(text)
  return match ? parseYamlText(match[1] ?? '', file) : null
}
