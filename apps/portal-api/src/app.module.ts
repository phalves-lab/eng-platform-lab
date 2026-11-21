import { type DynamicModule, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AskModule } from './ask/ask.module.js'
import { AuthGuard } from './auth/auth.guard.js'
import { MeController } from './auth/me.controller.js'
import { TOKEN_VERIFIER, type TokenVerifier, createEntraVerifier } from './auth/token-verifier.js'
import { CONFIG, type PortalConfig } from './config/config.js'
import { HandbookModule } from './handbook/handbook.module.js'
import { HealthController } from './health/health.controller.js'
import { ReviewModule } from './review/review.module.js'

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
