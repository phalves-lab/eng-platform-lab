import { parseArgs } from 'node:util'
import { DeployEventSchema, deployRequests, publishDeployEvent } from './deploy-event.js'

const { values } = parseArgs({
  options: {
    repo: { type: 'string', default: process.env.GITHUB_REPOSITORY ?? '' },
    environment: { type: 'string', default: 'production' },
    sha: { type: 'string', default: process.env.GITHUB_SHA ?? '' },
    status: { type: 'string', default: 'success' },
    at: { type: 'string' },
    url: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const main = async () => {
  const event = DeployEventSchema.parse({
    repo: values.repo,
    environment: values.environment,
    sha: values.sha,
    status: values.status,
    deployedAt: values.at ?? new Date().toISOString(),
    ...(values.url ? { url: values.url } : {}),
  })
  if (values['dry-run']) {
    console.log(JSON.stringify(deployRequests(event), null, 2))
    return
  }
  const { deploymentId } = await publishDeployEvent(event, {
    token: process.env.GITHUB_TOKEN ?? '',
    ...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
  })
  console.log(
    `Deploy registrado: ${event.repo} ${event.environment} ${event.sha} ${event.status} (deployment ${deploymentId}).`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
