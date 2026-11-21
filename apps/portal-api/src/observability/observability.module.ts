import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import { shutdownTelemetry, traceFields } from '@lab/telemetry'
import {
  LOG_WRITER,
  type LogWriter,
  NestJsonLogger,
  PORTAL_LOGGER,
  createPortalLogger,
  writeToStdout,
} from './logger.js'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { RequestContextMiddleware, requestContext } from './request-context.js'

/** Flushes spans and metrics when Nest shuts down (SIGTERM on Cloud Run). */
@Injectable()
export class TelemetryLifecycle implements OnApplicationShutdown {
  onApplicationShutdown() {
    return shutdownTelemetry()
  }
}

@Global()
@Module({
  providers: [
    {
      provide: LOG_WRITER,
      inject: [CONFIG],
      useFactory: (config: PortalConfig): LogWriter =>
        config.env === 'test' ? () => undefined : writeToStdout,
    },
    {
      provide: PORTAL_LOGGER,
      inject: [LOG_WRITER],
      useFactory: (write: LogWriter) =>
        createPortalLogger(write, () => ({ ...requestContext.getStore(), ...traceFields() })),
    },
    NestJsonLogger,
    RequestContextMiddleware,
    TelemetryLifecycle,
  ],
  exports: [PORTAL_LOGGER, NestJsonLogger, RequestContextMiddleware],
})
export class ObservabilityModule {}
