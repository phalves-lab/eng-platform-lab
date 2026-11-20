import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { runMigrations } from './db/migrate.js'
import { PostgresCampaignRequestRepository } from './db/postgres-repository.js'
import { buildApp } from './http/app.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL não definido.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl })
await runMigrations(pool, fileURLToPath(new URL('../migrations', import.meta.url)))

const app = buildApp({
  repository: new PostgresCampaignRequestRepository(pool),
  clock: () => new Date(),
  newId: randomUUID,
})

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
