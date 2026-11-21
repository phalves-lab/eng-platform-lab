import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/
const CONTROL_TABLE = 'portal_schema_migrations'

export interface MigrationOptions {
  directory?: string
}

interface Migration {
  name: string
  sql: string
  checksum: string
}

const readMigrations = async (directory: string): Promise<Migration[]> => {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  return Promise.all(
    files.map(async (name) => {
      if (!MIGRATION_FILE.test(name)) throw new Error(`Invalid migration file name: ${name}`)
      const sql = await readFile(join(directory, name), 'utf8')
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    }),
  )
}

const applyOne = async (client: pg.PoolClient, migration: Migration) => {
  await client.query('BEGIN')
  try {
    await client.query(migration.sql)
    await client.query(`INSERT INTO ${CONTROL_TABLE} (name, checksum) VALUES ($1, $2)`, [
      migration.name,
      migration.checksum,
    ])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/**
 * Applies pending SQL migrations in name order, each in its own transaction. An advisory lock
 * per schema keeps concurrent runners (worker and API) from racing, and an applied file whose
 * content changed fails the run instead of drifting silently.
 */
export const runMigrations = async (
  pool: pg.Pool,
  options: MigrationOptions = {},
): Promise<string[]> => {
  const migrations = await readMigrations(options.directory ?? MIGRATIONS_DIR)
  const client = await pool.connect()
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext(current_schema() || '.${CONTROL_TABLE}'))`)
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    )
    const applied = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          `SELECT name, checksum FROM ${CONTROL_TABLE}`,
        )
      ).rows.map((row) => [row.name, row.checksum]),
    )
    const executed: string[] = []
    for (const migration of migrations) {
      const checksum = applied.get(migration.name)
      if (checksum === migration.checksum) continue
      if (checksum !== undefined) {
        throw new Error(`Migration ${migration.name} changed after being applied`)
      }
      await applyOne(client, migration)
      executed.push(migration.name)
    }
    return executed
  } finally {
    await client
      .query(`SELECT pg_advisory_unlock(hashtext(current_schema() || '.${CONTROL_TABLE}'))`)
      .finally(() => client.release())
  }
}
