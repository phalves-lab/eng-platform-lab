import pg from 'pg'

export interface PoolOptions {
  connectionString: string
  max?: number
  searchPath?: string
  applicationName?: string
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

/** Creates a connection pool; `searchPath` pins every connection to one schema. */
export const createPool = (options: PoolOptions): pg.Pool => {
  if (options.searchPath !== undefined && !IDENTIFIER.test(options.searchPath)) {
    throw new Error(`Invalid schema name: ${options.searchPath}`)
  }
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 5,
    application_name: options.applicationName ?? 'eng-platform-lab',
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  })
}

export type { Pool, PoolClient } from 'pg'

/** Runs `work` inside one transaction, rolling back on any error. */
export const withTransaction = async <T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
