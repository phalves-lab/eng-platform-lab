import { ReleasePreviewSchema, ReleaseProjectSchema } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  CHECKS_LABEL,
  CHECKS_TONE,
  commonBranches,
  formatDate,
  previewTotals,
  resolveSelection,
  selectionQuery,
  shortList,
  sideOptions,
  WARNING_LABEL,
} from '../src/lib/releases'

const both = ReleaseProjectSchema.parse({
  id: 'demo',
  name: 'Demo',
  repos: { front: 'acme/web', back: 'acme/api' },
})
const solo = ReleaseProjectSchema.parse({
  id: 'solo',
  name: 'Solo',
  repos: { back: 'acme/solo' },
  source: 'beta',
})

describe('release selection', () => {
  it('offers "both" only for two-sided projects and defaults to it', () => {
    expect(sideOptions(both)).toEqual(['front', 'back', 'both'])
    expect(sideOptions(solo)).toEqual(['back'])
    expect(resolveSelection({}, [both, solo])).toMatchObject({
      project: { id: 'demo' },
      side: 'both',
      source: 'develop',
      target: 'main',
    })
    expect(resolveSelection({ projeto: 'solo', lado: 'both' }, [both, solo])).toMatchObject({
      side: 'back',
      source: 'beta',
    })
    expect(resolveSelection({}, [])).toBeNull()
  })

  it('keeps valid branches from the query and drops unsafe ones', () => {
    const selection = resolveSelection(
      { projeto: 'demo', lado: 'front', origem: 'release/2026-11', destino: 'x y' },
      [both],
    )
    expect(selection).toMatchObject({ side: 'front', source: 'release/2026-11', target: 'main' })
  })

  it('writes only non-default branches in the query', () => {
    expect(selectionQuery({ project: both, side: 'both', source: 'develop', target: 'main' })).toBe(
      'projeto=demo&lado=both',
    )
    expect(selectionQuery({ project: both, side: 'back', source: 'beta', target: 'prod' })).toBe(
      'projeto=demo&lado=back&origem=beta&destino=prod',
    )
  })

  it('intersects branch lists', () => {
    expect(
      commonBranches([
        ['main', 'develop', 'x'],
        ['develop', 'main'],
      ]),
    ).toEqual(['main', 'develop'])
    expect(commonBranches([])).toEqual([])
  })
})

describe('release summary', () => {
  const pr = (number: number) => ({
    number,
    title: 't',
    url: `https://github.example/pr/${number}`,
    author: 'ana',
    mergedAt: 'x',
  })
  const ticket = (overrides: Record<string, unknown>) => ({
    key: 'LAB-1',
    title: 't',
    url: null,
    summary: null,
    pulls: [pr(1)],
    authors: ['ana'],
    sql: [],
    env: { names: [], notes: [] },
    multiplePulls: false,
    ...overrides,
  })
  const side = (name: 'front' | 'back', repo: string, tickets: unknown[]) => ({
    side: name,
    repo,
    source: 'develop',
    target: 'main',
    aheadBy: 1,
    behindBy: 0,
    cutoff: { kind: 'none', ref: null, at: null, url: null },
    pulls: tickets.length,
    tickets,
    authors: ['ana'],
    checks: { state: 'none', total: 0, failed: [], pending: 0 },
    openRelease: null,
    releaseBranch: null,
    warnings: [],
  })
  const preview = (sides: unknown[]) =>
    ReleasePreviewSchema.parse({
      project: { id: 'demo', name: 'Demo', mode: 'pr' },
      side: 'both',
      generatedAt: '2026-11-21T00:00:00Z',
      sides,
      authors: ['ana', 'bruno'],
      deployOrder: { sides: ['back', 'front'], reason: 'migration' },
    })

  it('adds up PRs, tickets, SQL, ENV and authors across sides', () => {
    const totals = previewTotals(
      preview([
        side('front', 'acme/web', [ticket({ env: { names: [], notes: ['nova flag'] } })]),
        side('back', 'acme/api', [
          ticket({ key: 'LAB-2', pulls: [pr(2), pr(3)], sql: ['SELECT 1;'], multiplePulls: true }),
          ticket({ key: null, pulls: [pr(4)] }),
        ]),
      ]),
    )
    expect(totals).toEqual({
      pulls: 4,
      tickets: 3,
      multiple: 1,
      sql: 1,
      env: 1,
      authors: ['ana', 'bruno'],
    })
  })

  it('counts a monorepo once when both sides point to the same repository', () => {
    const tickets = [ticket({ sql: ['SELECT 1;'] }), ticket({ key: null, pulls: [pr(2)] })]
    const totals = previewTotals(
      preview([side('front', 'acme/mono', tickets), side('back', 'acme/mono', tickets)]),
    )
    expect(totals).toMatchObject({ pulls: 2, tickets: 2, sql: 1 })
  })

  it('labels checks and warnings and formats lists', () => {
    expect(Object.keys(CHECKS_LABEL)).toEqual(Object.keys(CHECKS_TONE))
    expect(CHECKS_TONE.failure).toBe('danger')
    expect(WARNING_LABEL['target-ahead']).toBe('Destino à frente')
    expect(shortList(['a', 'b'])).toBe('a, b')
    expect(shortList(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c e mais 2')
    expect(formatDate('2026-11-01T12:00:00Z')).toBe('01/11/2026')
  })
})
