import { describe, expect, it } from 'vitest'
import { DeployEventSchema, deployRequests, publishDeployEvent } from '../src/deploy-event.js'

const event = {
  repo: 'lab-demo/campanhas-api',
  sha: 'ABCDEF1234567',
  status: 'success' as const,
  deployedAt: '2026-11-20T18:00:00Z',
  url: 'https://example.invalid/runs/9',
}

const fakeGitHub = (statuses: number[]) => {
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get('Authorization'),
    })
    const status = statuses[calls.length - 1] ?? 500
    return Promise.resolve(new Response(JSON.stringify({ id: 77 }), { status }))
  }
  return { calls, fetchImpl }
}

describe('deploy event', () => {
  it('normalizes the event and defaults to production', () => {
    expect(DeployEventSchema.parse(event)).toEqual({
      ...event,
      sha: 'abcdef1234567',
      environment: 'production',
    })
    expect(DeployEventSchema.safeParse({ ...event, sha: 'xyz' }).success).toBe(false)
    expect(DeployEventSchema.safeParse({ ...event, status: 'ok' }).success).toBe(false)
    expect(DeployEventSchema.safeParse({ ...event, url: 'ftp://x' }).success).toBe(false)
  })

  it('marks a rollback in the status description, since GitHub has no such state', () => {
    const rolled = deployRequests(
      DeployEventSchema.parse({ ...event, status: 'rolled_back', url: undefined }),
    )
    expect(rolled.status).toEqual({
      state: 'failure',
      description: 'eng-metrics:rolled_back',
      auto_inactive: true,
    })
    const staging = deployRequests(DeployEventSchema.parse({ ...event, environment: 'staging' }))
    expect(staging.deployment).toMatchObject({
      ref: 'abcdef1234567',
      environment: 'staging',
      production_environment: false,
      auto_merge: false,
      required_contexts: [],
      payload: { deployedAt: '2026-11-20T18:00:00Z', status: 'success' },
    })
  })

  it('creates the deployment and then its final status', async () => {
    const github = fakeGitHub([201, 201])
    const result = await publishDeployEvent(event, {
      token: 't0k',
      apiUrl: 'https://github.example.invalid/',
      fetchImpl: github.fetchImpl,
    })
    expect(result).toEqual({ deploymentId: 77 })
    expect(github.calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', 'https://github.example.invalid/repos/lab-demo/campanhas-api/deployments'],
      [
        'POST',
        'https://github.example.invalid/repos/lab-demo/campanhas-api/deployments/77/statuses',
      ],
    ])
    expect(github.calls[1]?.body).toEqual({
      state: 'success',
      description: 'eng-metrics:success',
      auto_inactive: true,
      log_url: 'https://example.invalid/runs/9',
    })
    expect(github.calls.every((call) => call.auth === 'Bearer t0k')).toBe(true)
  })

  it('stops at the first GitHub error and requires a token', async () => {
    const github = fakeGitHub([403])
    await expect(
      publishDeployEvent(event, { token: 't', fetchImpl: github.fetchImpl }),
    ).rejects.toThrow('GitHub respondeu 403 em /repos/lab-demo/campanhas-api/deployments.')
    expect(github.calls).toHaveLength(1)
    await expect(
      publishDeployEvent(event, { token: '', fetchImpl: github.fetchImpl }),
    ).rejects.toThrow('GITHUB_TOKEN ausente')
  })
})
