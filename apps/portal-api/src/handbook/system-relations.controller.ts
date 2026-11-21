import { Controller, Get, Param } from '@nestjs/common'
import type { SystemRelations } from '@lab/contracts'
import { SystemRelationsService } from './system-relations.service.js'

@Controller('api/handbook/systems')
export class SystemRelationsController {
  constructor(private readonly relations: SystemRelationsService) {}

  @Get(':slug/relations')
  relationsOf(@Param('slug') slug: string): SystemRelations {
    return this.relations.relations(slug)
  }
}
