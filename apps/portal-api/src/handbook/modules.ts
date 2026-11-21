import { type CatalogModule, CatalogModuleSchema } from '@lab/contracts'
import { loadYamlCatalog } from '../common/yaml-catalog.js'

/** Modules of `catalog/modules` by name; the review bot reads the same files. */
export const loadModuleCatalog = (directory: string): Map<string, CatalogModule> =>
  new Map(
    loadYamlCatalog(directory, CatalogModuleSchema, 'Catálogo de módulos').map(({ value }) => [
      value.name,
      value,
    ]),
  )
