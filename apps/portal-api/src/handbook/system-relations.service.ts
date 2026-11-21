import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common'
import type { CatalogModule, SystemEvent, SystemPeer, SystemRelations } from '@lab/contracts'
import {
  type EventContract,
  type Handbook,
  findSystem,
  moduleOf,
  normalize,
  systemEvents,
} from '@lab/handbook'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookService } from './handbook.service.js'
import { loadModuleCatalog } from './modules.js'

const peerOf = (handbook: Handbook, name: string): SystemPeer => {
  const card = handbook.systems.find((system) => normalize(system.name) === normalize(name))
  return { name: card?.name ?? name, slug: card?.slug ?? null }
}

const toEvent = (handbook: Handbook, contract: EventContract, peers: string[]): SystemEvent => ({
  topic: contract.topic,
  event: contract.event,
  payload: contract.payload,
  source: contract.source,
  peers: peers.map((name) => peerOf(handbook, name)),
})

/** Links of a system card: owner, event contracts on both sides and the catalog module. */
@Injectable()
export class SystemRelationsService implements OnModuleInit {
  private modules = new Map<string, CatalogModule>()

  constructor(
    private readonly handbook: HandbookService,
    @Inject(CONFIG) private readonly config: Pick<PortalConfig, 'modulesDir'>,
  ) {}

  onModuleInit() {
    this.modules = loadModuleCatalog(this.config.modulesDir)
  }

  relations(slug: string): SystemRelations {
    const handbook = this.handbook.snapshot()
    const system = findSystem(handbook, slug)
    if (!system) throw new NotFoundException(`System ${slug} not found`)
    const events = systemEvents(handbook.events, system)
    const moduleId = moduleOf(system)
    return {
      slug: system.slug,
      owner: system.fields['Dono'] ?? null,
      produces: events.produces.map((contract) => toEvent(handbook, contract, contract.consumers)),
      consumes: events.consumes.map((contract) => toEvent(handbook, contract, [contract.producer])),
      moduleId,
      module: moduleId ? (this.modules.get(moduleId) ?? null) : null,
    }
  }
}
