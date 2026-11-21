import { describe, expect, it } from 'vitest'
import { DeploySchema, JiraIssueSchema, SnapshotPayloadSchema } from '../src/index.js'
import { issue, payload } from './factories.js'

describe('schemas', () => {
  it('accepts a dataset computed by the collector', () => {
    expect(SnapshotPayloadSchema.parse(payload('lab'))).toEqual(payload('lab'))
  })

  it('rejects payloads missing computed sections or with unknown levels', () => {
    const withoutMetrics: Record<string, unknown> = { ...payload('lab') }
    delete withoutMetrics.metrics
    expect(SnapshotPayloadSchema.safeParse(withoutMetrics).success).toBe(false)
    const broken = payload('lab')
    expect(
      SnapshotPayloadSchema.safeParse({
        ...broken,
        queue: [{ ...broken.queue[0], level: 'urgente' }],
      }).success,
    ).toBe(false)
  })

  it('validates Jira keys and deploy SHAs', () => {
    expect(JiraIssueSchema.safeParse({ ...issue('LAB-1'), key: 'lab-1' }).success).toBe(false)
    expect(
      DeploySchema.safeParse({
        repo: 'phalves-lab/eng-platform-lab',
        environment: 'production',
        sha: 'XYZ',
        deployedAt: '2026-11-20T10:00:00.000Z',
        status: 'success',
      }).success,
    ).toBe(false)
  })
})
