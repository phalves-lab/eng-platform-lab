import { z } from 'zod'

/** One deploy as the pipeline reports it right after it finishes. */
export const DeployEventSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be owner/name'),
  environment: z.string().trim().min(1).default('production'),
  sha: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{7,40}$/, 'sha must be a hexadecimal commit SHA'),
  status: z.enum(['success', 'failure', 'rolled_back']),
  deployedAt: z.iso.datetime({ offset: true }),
  url: z.url({ protocol: /^https?$/ }).optional(),
})
export type DeployEvent = z.infer<typeof DeployEventSchema>
export type DeployEventInput = z.input<typeof DeployEventSchema>

export interface DeployRequests {
  deployment: Record<string, unknown>
  status: Record<string, unknown>
}

/**
 * GitHub deployment and deployment status bodies for one deploy. The status description carries
 * `eng-metrics:<status>` because GitHub has no rolled back state; the DORA collector reads it.
 */
export const deployRequests = (event: DeployEvent): DeployRequests => ({
  deployment: {
    ref: event.sha,
    environment: event.environment,
    auto_merge: false,
    required_contexts: [],
    production_environment: event.environment === 'production',
    description: 'eng-metrics',
    payload: { deployedAt: event.deployedAt, status: event.status },
  },
  status: {
    state: event.status === 'success' ? 'success' : 'failure',
    description: `eng-metrics:${event.status}`,
    auto_inactive: true,
    ...(event.url ? { log_url: event.url } : {}),
  },
})

export interface PublishOptions {
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}

const CreatedSchema = z.object({ id: z.number().int() })

/** Records the deploy as a GitHub deployment with its final status, where the collector reads it. */
export const publishDeployEvent = async (
  input: DeployEventInput,
  options: PublishOptions,
): Promise<{ deploymentId: number }> => {
  if (!options.token) throw new Error('GITHUB_TOKEN ausente: não há como registrar o deploy.')
  const event = DeployEventSchema.parse(input)
  const apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const bodies = deployRequests(event)

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    })
    if (response.status !== 201) throw new Error(`GitHub respondeu ${response.status} em ${path}.`)
    return CreatedSchema.parse(await response.json())
  }

  const deployment = await post(`/repos/${event.repo}/deployments`, bodies.deployment)
  await post(`/repos/${event.repo}/deployments/${deployment.id}/statuses`, bodies.status)
  return { deploymentId: deployment.id }
}
