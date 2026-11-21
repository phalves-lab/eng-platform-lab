import { type ProjectEntry, ProjectEntrySchema } from '@lab/contracts'
import { loadYamlCatalog, stem } from '../common/yaml-catalog.js'

export interface CatalogProject {
  entry: ProjectEntry
  /** Path shown as the source of the project, relative to the repository. */
  source: string
}

/** Projects of `catalog/projects`, where each file is named after the project id. */
export const loadProjectCatalog = (directory: string): CatalogProject[] =>
  loadYamlCatalog(directory, ProjectEntrySchema, 'Catálogo de projetos').map(({ file, value }) => {
    if (stem(file) !== value.id) {
      throw new Error(
        `Catálogo de projetos: ${file} declara o id ${value.id}; use ${value.id}.yaml`,
      )
    }
    return { entry: value, source: `catalog/projects/${file}` }
  })
