import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ReleaseProject, ReleaseProjectSchema } from '@lab/contracts'
import { parse } from 'yaml'

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/**
 * Reads every release project in the directory. A missing directory means no project; an invalid
 * file or a repeated id fails with the file name so the API does not boot with a broken catalog.
 */
export const loadReleaseCatalog = (directory: string): ReleaseProject[] => {
  let files: string[]
  try {
    files = readdirSync(directory)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort()
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const projects: ReleaseProject[] = []
  for (const file of files) {
    const parsed = ReleaseProjectSchema.safeParse(
      parse(readFileSync(join(directory, file), 'utf8')),
    )
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ')
      throw new Error(`Catálogo de releases inválido em ${file}: ${issues}`)
    }
    if (projects.some((project) => project.id === parsed.data.id)) {
      throw new Error(`Catálogo de releases repete o id ${parsed.data.id} em ${file}`)
    }
    projects.push(parsed.data)
  }
  return projects
}
