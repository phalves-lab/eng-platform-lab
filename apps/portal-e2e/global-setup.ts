import { spawnSync } from 'node:child_process'
import { REPO_ROOT, SCORECARD_FILE, databaseUrl } from './env.js'

/** Seeds the database with the demo dataset, the Jira fixture, DORA fixtures and the scorecard. */
export default function globalSetup() {
  const result = spawnSync('npm', ['run', 'worker', '-w', '@lab/portal-worker', '--', '--once'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(),
      WORKER_DATASETS: 'demo',
      WORKER_JIRA_SOURCE: 'fixture',
      WORKER_SCORECARD_OUT: SCORECARD_FILE,
      OTEL_ENABLED: 'false',
    },
  })
  if (result.status !== 0) throw new Error(`worker seed failed with status ${result.status}`)
}
