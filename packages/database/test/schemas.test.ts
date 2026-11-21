import { describe, expect, it } from 'vitest'
import {
  ChangeSchema,
  DeploySchema,
  IncidentSchema,
  JiraIssueSchema,
  SnapshotPayloadSchema,
} from '../src/index.js'
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

  it('keeps deploy links on http and fills the DORA defaults', () => {
    const deploy = {
      repo: 'lab-demo/campanhas-api',
      environment: 'production',
      sha: 'abc1234',
      deployedAt: '2026-11-20T10:00:00.000Z',
      status: 'success',
    }
    expect(DeploySchema.parse(deploy)).toMatchObject({ url: null, commitShas: [] })
    expect(DeploySchema.safeParse({ ...deploy, url: 'javascript:alert(1)' }).success).toBe(false)
    expect(DeploySchema.safeParse({ ...deploy, commitShas: ['nope'] }).success).toBe(false)
    expect(
      IncidentSchema.parse({
        id: 'INC-1',
        system: 'campanhas',
        severity: 'sev2',
        startedAt: '2026-11-20T10:00:00.000Z',
        endedAt: null,
      }),
    ).toMatchObject({ title: null, cause: null })
    expect(
      ChangeSchema.safeParse({
        repo: 'lab-demo/campanhas-api',
        pullNumber: 0,
        mergeSha: 'abc1234',
        firstCommitAt: '2026-11-20T10:00:00.000Z',
        mergedAt: '2026-11-20T11:00:00.000Z',
      }).success,
    ).toBe(false)
  })
})
