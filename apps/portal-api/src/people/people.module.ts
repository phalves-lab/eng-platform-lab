import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { PEOPLE, loadPeopleDirectory } from './people.js'

@Module({
  providers: [
    {
      provide: PEOPLE,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => loadPeopleDirectory(config.peopleDir),
    },
  ],
  exports: [PEOPLE],
})
export class PeopleModule {}
