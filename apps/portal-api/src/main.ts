import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { createJsonLogger } from '@lab/telemetry'
import helmet from 'helmet'
import { AppModule } from './app.module.js'
import { loadConfig } from './config/config.js'
import { NestJsonLogger } from './observability/logger.js'

const bootstrap = async () => {
  const config = loadConfig(process.env)
  const app = await NestFactory.create(AppModule.register(config), { bufferLogs: true })
  const logger = app.get(NestJsonLogger)
  app.useLogger(logger)
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy)
  app.use(helmet())
  app.enableShutdownHooks()
  await app.listen(config.port)
  logger.log(`portal-api on :${config.port} (auth: ${config.auth.mode})`, 'Bootstrap')
}

bootstrap().catch((error: unknown) => {
  createJsonLogger(undefined, { service: 'portal-api' }).error('bootstrap.failed', { error })
  process.exit(1)
})
