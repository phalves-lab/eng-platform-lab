export type LogFields = Record<string, unknown>

export interface Logger {
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  child: (fields: LogFields) => Logger
}

const serialize = (fields: LogFields): LogFields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) =>
      value instanceof Error ? [key, { name: value.name, message: value.message }] : [key, value],
    ),
  )

/** JSON lines logger: one object per line with time, level, message and context fields. */
export const createLogger = (
  write: (line: string) => void = (line) => process.stdout.write(line),
  base: LogFields = {},
  clock: () => Date = () => new Date(),
): Logger => {
  const log =
    (level: 'info' | 'warn' | 'error') =>
    (message: string, fields: LogFields = {}) =>
      write(
        `${JSON.stringify({ time: clock().toISOString(), level, msg: message, ...base, ...serialize(fields) })}\n`,
      )
  return {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (fields) => createLogger(write, { ...base, ...fields }, clock),
  }
}
