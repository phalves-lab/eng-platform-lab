import { type DynamicModule, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AskModule } from './ask/ask.module.js'
import { AuthGuard } from './auth/auth.guard.js'
import { MeController } from './auth/me.controller.js'
import { TOKEN_VERIFIER, type TokenVerifier, createEntraVerifier } from './auth/token-verifier.js'
import { CatalogModule } from './catalog/catalog.module.js'
import { CONFIG, type PortalConfig } from './config/config.js'
import { DoraModule } from './dora/dora.module.js'
import { FlowModule } from './flow/flow.module.js'
import { HandbookModule } from './handbook/handbook.module.js'
import { HealthController } from './health/health.controller.js'
import { MetricsModule } from './metrics/metrics.module.js'
import { QualityModule } from './quality/quality.module.js'
import { ReleasesModule } from './releases/releases.module.js'
import { ReviewModule } from './review/review.module.js'
import { WorkModule } from './work/work.module.js'

const devOnlyVerifier: TokenVerifier = {
  verify: () => Promise.reject(new Error('token verification is disabled in dev mode')),
}

@Module({})
export class AppModule {
  /** Builds the application module around an already validated configuration. */
  static register(config: PortalConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
        HandbookModule,
        ReviewModule,
        AskModule,
        MetricsModule,
        CatalogModule,
        ReleasesModule,
        DoraModule,
        FlowModule,
        QualityModule,
        WorkModule,
      ],
      controllers: [HealthController, MeController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: TOKEN_VERIFIER,
          useValue:
            config.auth.mode === 'entra'
              ? createEntraVerifier(config.auth, config.leadLogins)
              : devOnlyVerifier,
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [CONFIG],
    }
  }
}
