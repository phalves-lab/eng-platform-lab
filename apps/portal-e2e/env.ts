import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const DATA_DIR = fileURLToPath(new URL('./.e2e-data/', import.meta.url))
mkdirSync(DATA_DIR, { recursive: true })

const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback)

export const API_PORT = port('E2E_API_PORT', 4600)
export const WEB_PORT = port('E2E_WEB_PORT', 3600)
export const GITHUB_PORT = port('E2E_GITHUB_PORT', 4601)
export const SCORECARD_FILE = `${DATA_DIR}scorecard.json`

/** Postgres of the e2e stack; the worker seeds it from the synthetic fixtures before the run. */
export const databaseUrl = () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('e2e needs DATABASE_URL pointing to a disposable Postgres')
  return url
}
