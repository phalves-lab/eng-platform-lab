import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { createRestGitHub, GITHUB_CLIENT } from './github.js'
import { createRestGitHubWriter, GITHUB_WRITER } from './github-writer.js'
import { ReleaseWriteService } from './release-write.service.js'
import { ReleasesController } from './releases.controller.js'
import { ReleasesService } from './releases.service.js'
import { createReleaseRunStore, RELEASE_RUN_STORE } from './run-store.js'

@Module({
  controllers: [ReleasesController],
  providers: [
    ReleasesService,
    ReleaseWriteService,
    {
      provide: GITHUB_CLIENT,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) =>
        config.github.token
          ? createRestGitHub({ token: config.github.token, apiUrl: config.github.apiUrl })
          : null,
    },
    {
      provide: GITHUB_WRITER,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) =>
        config.releaseWrite.enabled && config.releaseWrite.token
          ? createRestGitHubWriter({
              token: config.releaseWrite.token,
              apiUrl: config.github.apiUrl,
            })
          : null,
    },
    {
      provide: RELEASE_RUN_STORE,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createReleaseRunStore(config.panelSource),
    },
  ],
})
export class ReleasesModule {}
