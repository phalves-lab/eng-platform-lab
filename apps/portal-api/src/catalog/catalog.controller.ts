import { Controller, Get, Param, Query } from '@nestjs/common'
import { type PluginFilter, PluginFilterSchema } from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { CatalogService } from './catalog.service.js'

@Controller('api/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('plugins')
  plugins(@Query(new ZodPipe(PluginFilterSchema)) filter: PluginFilter) {
    return this.catalog.plugins(filter)
  }

  @Get('plugins/:name')
  plugin(@Param('name') name: string) {
    return this.catalog.plugin(name)
  }

  @Get('mcps')
  mcps() {
    return this.catalog.mcps()
  }
}
