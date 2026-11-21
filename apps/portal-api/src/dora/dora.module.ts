import { Module } from '@nestjs/common'
import { loadDoraCatalog } from '@lab/dora'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { DORA_SOURCE, createDoraSource } from './dora-source.js'
import { DoraController } from './dora.controller.js'
import { DORA_CATALOG, DoraService } from './dora.service.js'

@Module({
  controllers: [DoraController],
  providers: [
    {
      provide: DORA_CATALOG,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => loadDoraCatalog(config.dora.catalogFile),
    },
    { provide: DORA_SOURCE, inject: [CONFIG], useFactory: createDoraSource },
    DoraService,
  ],
})
export class DoraModule {}
