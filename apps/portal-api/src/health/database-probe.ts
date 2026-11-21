import { type Pool, createPool } from '@lab/database'
import type { HealthCheck } from '@lab/contracts'
import type { PortalConfig } from '../config/config.js'

export const DATABASE_PROBE = Symbol('DATABASE_PROBE')

export interface DatabaseProbe {
  check: () => Promise<HealthCheck>
  close: () => Promise<void>
}

export const PROBE_TIMEOUT_MS = 2_000

const timeout = (ms: number) =>
  new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms).unref())

/**
 * Answers `SELECT 1` within the timeout. Failures report a fixed detail only, since driver
 * messages can name the host or the database user.
 */
export const probePool = (
  pool: Pick<Pool, 'query' | 'end'>,
  onError: (error: unknown) => void,
  timeoutMs = PROBE_TIMEOUT_MS,
): DatabaseProbe => ({
  check: async () => {
    try {
      const outcome = await Promise.race([pool.query('SELECT 1'), timeout(timeoutMs)])
      return outcome === 'timeout' ? { status: 'failed', detail: 'timeout' } : { status: 'ok' }
    } catch (error) {
      onError(error)
      return { status: 'failed', detail: 'unreachable' }
    }
  },
  close: () => pool.end(),
})

const notConfigured: DatabaseProbe = {
  check: () => Promise.resolve({ status: 'skipped', detail: 'not_configured' }),
  close: () => Promise.resolve(),
}

export const createDatabaseProbe = (
  source: PortalConfig['panelSource'],
  onError: (error: unknown) => void,
): DatabaseProbe => {
  if (source.kind !== 'database') return notConfigured
  const pool = createPool({
    connectionString: source.url,
    max: 1,
    applicationName: 'portal-api-health',
  })
  pool.on('error', onError)
  return probePool(pool, onError)
}
