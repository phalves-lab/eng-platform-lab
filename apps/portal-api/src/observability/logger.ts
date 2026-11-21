import { Inject, Injectable, type LoggerService } from '@nestjs/common'
import { type LogFields, type LogLevel, type Logger, createJsonLogger } from '@lab/telemetry'

export const PORTAL_LOGGER = Symbol('PORTAL_LOGGER')
export const LOG_WRITER = Symbol('LOG_WRITER')

export type LogWriter = (line: string) => void

export const writeToStdout: LogWriter = (line) => process.stdout.write(line)

/** JSON logger of the API; `context` adds the request and trace ids of the current request. */
export const createPortalLogger = (write: LogWriter, context: () => LogFields) =>
  createJsonLogger(write, { service: 'portal-api' }, () => new Date(), context)

const splitParams = (params: unknown[]) => {
  const last = params.at(-1)
  const context = params.length > 0 && typeof last === 'string' ? last : undefined
  const rest = context === undefined ? params : params.slice(0, -1)
  return { context, rest }
}

/**
 * Routes Nest's own logs (bootstrap, router, unhandled exceptions) to the JSON logger.
 * Debug and verbose messages are dropped.
 */
@Injectable()
export class NestJsonLogger implements LoggerService {
  constructor(@Inject(PORTAL_LOGGER) private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params)
  }

  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params)
  }

  error(message: unknown, ...params: unknown[]) {
    const { context, rest } = splitParams(params)
    const stack = rest.find((item): item is string => typeof item === 'string')
    this.logger.error(this.text(message), {
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
    })
  }

  debug() {
    return undefined
  }

  verbose() {
    return undefined
  }

  private write(level: LogLevel, message: unknown, params: unknown[]) {
    const { context } = splitParams(params)
    this.logger[level](this.text(message), context ? { context } : {})
  }

  private text(message: unknown) {
    if (message instanceof Error) return `${message.name}: ${message.message}`
    return typeof message === 'string' ? message : JSON.stringify(message)
  }
}
