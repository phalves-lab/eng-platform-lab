import { scrubText, scrubValue } from './redact.js'
import { traceFields } from './trace.js'

export type LogFields = Record<string, unknown>

export type LogLevel = 'info' | 'warn' | 'error'

export interface Logger {
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  child: (fields: LogFields) => Logger
}

/**
 * JSON lines logger: one object per line with time, level, message, the active trace ids and
 * context fields. Strings are scrubbed of personal data before they are written.
 */
export const createJsonLogger = (
  write: (line: string) => void = (line) => process.stdout.write(line),
  base: LogFields = {},
  clock: () => Date = () => new Date(),
  context: () => LogFields = traceFields,
): Logger => {
  const log =
    (level: LogLevel) =>
    (message: string, fields: LogFields = {}) =>
      write(
        `${JSON.stringify({
          time: clock().toISOString(),
          level,
          msg: scrubText(message),
          ...context(),
          ...(scrubValue(base) as LogFields),
          ...(scrubValue(fields) as LogFields),
        })}\n`,
      )
  return {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (fields) => createJsonLogger(write, { ...base, ...fields }, clock, context),
  }
}
