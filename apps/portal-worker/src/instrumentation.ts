import { loadTelemetryConfig, startTelemetry } from '@lab/telemetry'

startTelemetry(loadTelemetryConfig(process.env, 'portal-worker'), {
  ...(process.env.APP_VERSION ? { version: process.env.APP_VERSION } : {}),
})
