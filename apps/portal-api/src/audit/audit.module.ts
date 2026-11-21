import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { AUDIT_STORE, createAuditStore } from './audit-store.js'
import { AuditController } from './audit.controller.js'
import { AuditInterceptor } from './audit.interceptor.js'
import { AuditService } from './audit.service.js'

@Module({
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_STORE,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createAuditStore(config.panelSource),
    },
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AuditModule {}
