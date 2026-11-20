import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type pg from 'pg'

export const runMigrations = async (pool: pg.Pool, directory: string): Promise<string[]> => {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  )
  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (r) => r.name,
    ),
  )
  const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort()
  const executed: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(directory, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      executed.push(file)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return executed
}
