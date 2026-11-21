import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { McpServer, Plugin, PluginFilter, PluginSummary } from '@lab/contracts'
import {
  type AiCatalog,
  type CatalogPlugin,
  filterPlugins,
  findPlugin,
  loadAiCatalog,
} from '@lab/catalog'
import { CONFIG, type PortalConfig } from '../config/config.js'

const toSummary = ({ skills, install: _install, ...plugin }: CatalogPlugin): PluginSummary => ({
  ...plugin,
  skillCount: skills.length,
})

/**
 * Loads the plugin marketplace and the AI overlay once at boot. A broken or missing catalog is
 * logged and answered with 503, so the rest of the portal keeps working.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger('Catalog')
  private catalog: AiCatalog | null = null

  constructor(@Inject(CONFIG) private readonly config: PortalConfig) {}

  async onModuleInit() {
    try {
      this.catalog = await loadAiCatalog({
        marketplaceDir: this.config.marketplaceDir,
        overlayDir: this.config.aiCatalogDir,
      })
      for (const warning of this.catalog.warnings) this.logger.warn(warning)
    } catch (error) {
      this.logger.error(
        `AI catalog unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private get data(): AiCatalog {
    if (!this.catalog) throw new ServiceUnavailableException('Catálogo de IA indisponível')
    return this.catalog
  }

  plugins(filter: PluginFilter): PluginSummary[] {
    return filterPlugins(this.data, filter).map(toSummary)
  }

  plugin(name: string): Plugin {
    const found = findPlugin(this.data, name)
    if (!found) throw new NotFoundException(`Plugin ${name} not found`)
    return { ...toSummary(found), skills: found.skills, install: found.install }
  }

  mcps(): McpServer[] {
    return this.data.mcps
  }
}
