import { describe, expect, it } from 'vitest'
import { loadTelemetryConfig } from '../src/config.js'

describe('loadTelemetryConfig', () => {
  it('keeps export off by default, even with an endpoint set', () => {
    expect(loadTelemetryConfig({}, 'portal-api')).toEqual({ enabled: false })
    expect(
      loadTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }, 'portal-api'),
    ).toEqual({ enabled: false })
    expect(loadTelemetryConfig({ OTEL_ENABLED: '' }, 'portal-api')).toEqual({ enabled: false })
  })

  it('turns on with an endpoint and the service name of the caller', () => {
    expect(
      loadTelemetryConfig(
        {
          NODE_ENV: 'production',
          OTEL_ENABLED: 'true',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
        },
        'portal-worker',
      ),
    ).toEqual({
      enabled: true,
      endpoint: 'http://collector:4318',
      serviceName: 'portal-worker',
      environment: 'production',
      metricIntervalMs: 60_000,
    })
  })

  it('honors the service name and interval from the environment', () => {
    const config = loadTelemetryConfig(
      {
        OTEL_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.invalid',
        OTEL_SERVICE_NAME: 'portal-api-hml',
        OTEL_METRIC_EXPORT_INTERVAL: '15000',
      },
      'portal-api',
    )
    expect(config).toMatchObject({ serviceName: 'portal-api-hml', metricIntervalMs: 15_000 })
  })

  it('fails fast on an enabled exporter without endpoint or with invalid values', () => {
    expect(() => loadTelemetryConfig({ OTEL_ENABLED: 'true' }, 'portal-api')).toThrow(
      /requires OTEL_EXPORTER_OTLP_ENDPOINT/,
    )
    expect(() =>
      loadTelemetryConfig(
        { OTEL_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'ftp://collector' },
        'portal-api',
      ),
    ).toThrow(/Invalid telemetry configuration/)
    expect(() => loadTelemetryConfig({ OTEL_SERVICE_NAME: 'portal api' }, 'portal-api')).toThrow(
      /OTEL_SERVICE_NAME/,
    )
    expect(() => loadTelemetryConfig({ OTEL_ENABLED: 'yes' }, 'portal-api')).toThrow()
  })
})
