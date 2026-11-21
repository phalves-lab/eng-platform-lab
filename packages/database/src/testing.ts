import { randomBytes } from 'node:crypto'
import type pg from 'pg'
import { createPool } from './client.js'
import { runMigrations } from './migrate.js'

export interface IsolatedSchema {
  schema: string
  pool: pg.Pool
  connectionString: string
  drop: () => Promise<void>
}

/**
 * Creates a throwaway schema with every migration applied, so integration tests can share one
 * database (the CI service or the local container) without seeing each other's rows.
 */
export const createIsolatedSchema = async (connectionString: string): Promise<IsolatedSchema> => {
  const schema = `test_${randomBytes(6).toString('hex')}`
  const admin = createPool({ connectionString, max: 1 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = createPool({ connectionString, searchPath: schema })
  await runMigrations(pool)
  const url = new URL(connectionString)
  url.searchParams.set('options', `-c search_path=${schema}`)
  return {
    schema,
    pool,
    connectionString: url.toString(),
    drop: async () => {
      await pool.end()
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    },
  }
}
