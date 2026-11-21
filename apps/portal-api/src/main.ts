import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AppModule } from './app.module.js'
import { loadConfig } from './config/config.js'

const bootstrap = async () => {
  const config = loadConfig(process.env)
  const app = await NestFactory.create(AppModule.register(config), { bufferLogs: false })
  app.use(helmet())
  app.enableShutdownHooks()
  await app.listen(config.port)
  Logger.log(`portal-api on :${config.port} (auth: ${config.auth.mode})`, 'Bootstrap')
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap')
  process.exit(1)
})
