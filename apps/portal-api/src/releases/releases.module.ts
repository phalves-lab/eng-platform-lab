import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { createRestGitHub, GITHUB_CLIENT } from './github.js'
import { ReleasesController } from './releases.controller.js'
import { ReleasesService } from './releases.service.js'

@Module({
  controllers: [ReleasesController],
  providers: [
    ReleasesService,
    {
      provide: GITHUB_CLIENT,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) =>
        config.github.token
          ? createRestGitHub({ token: config.github.token, apiUrl: config.github.apiUrl })
          : null,
    },
  ],
})
export class ReleasesModule {}
