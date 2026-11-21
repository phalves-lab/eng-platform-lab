import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS_DIR, createPool, runMigrations } from '../src/index.js'

const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX|CONSTRAINT|TYPE)\b/i,
  /\bRENAME\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
]

const ADD_NOT_NULL_COLUMN = /\bADD\s+COLUMN\b(?:(?!DEFAULT)[^;,])*\bNOT\s+NULL\b(?![^;,]*DEFAULT)/i

describe('migration files', () => {
  it('only expand the schema, so the previous release keeps working', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
      for (const pattern of DESTRUCTIVE) expect(sql, `${file} ${pattern}`).not.toMatch(pattern)
      expect(sql, file).not.toMatch(ADD_NOT_NULL_COLUMN)
      expect(sql, file).not.toMatch(/CREATE\s+(TABLE|INDEX)\s+(?!IF NOT EXISTS)/i)
    }
  })

  it('flags destructive statements', () => {
    expect('ALTER TABLE deploys DROP COLUMN sha;').toMatch(DESTRUCTIVE[0] as RegExp)
    expect('ALTER TABLE deploys ADD COLUMN actor TEXT NOT NULL;').toMatch(ADD_NOT_NULL_COLUMN)
    expect("ALTER TABLE deploys ADD COLUMN actor TEXT NOT NULL DEFAULT 'x';").not.toMatch(
      ADD_NOT_NULL_COLUMN,
    )
  })

  it('rejects files outside the versioned naming scheme before touching the database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'migrations-'))
    await writeFile(join(directory, 'add-table.sql'), 'SELECT 1')
    const pool = createPool({ connectionString: 'postgres://nobody@127.0.0.1:1/none' })
    await expect(runMigrations(pool, { directory })).rejects.toThrow(
      'Invalid migration file name: add-table.sql',
    )
    await pool.end()
  })

  it('refuses schema names that are not plain identifiers', () => {
    expect(() =>
      createPool({ connectionString: 'postgres://x@localhost/x', searchPath: 'a;drop' }),
    ).toThrow('Invalid schema name')
  })
})
