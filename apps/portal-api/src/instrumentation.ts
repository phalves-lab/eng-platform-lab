import { loadTelemetryConfig, startTelemetry } from '@lab/telemetry'

startTelemetry(loadTelemetryConfig(process.env, 'portal-api'), {
  ...(process.env.APP_VERSION ? { version: process.env.APP_VERSION } : {}),
})
