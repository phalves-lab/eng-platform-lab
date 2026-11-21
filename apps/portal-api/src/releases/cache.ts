import type { GitHubClient } from './github.js'

const MAX_ENTRIES = 500

interface Entry {
  expiresAt: number
  value: Promise<unknown>
}

/**
 * Short-lived memo for GitHub reads. Concurrent callers share the same in-flight request and a
 * failed request is dropped right away, so errors are never served from the cache.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key)
    if (current && current.expiresAt > this.now()) return current.value as Promise<T>
    if (this.entries.size >= MAX_ENTRIES) this.prune()
    const value = load()
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value })
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
    })
    return value
  }

  private prune() {
    const now = this.now()
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key)
  }
}

/** Wraps a client so every read is memoized by method and arguments. */
export const withCache = (client: GitHubClient, cache: TtlCache): GitHubClient => {
  const memo =
    <A extends unknown[], R>(name: string, call: (...args: A) => Promise<R>) =>
    (...args: A) =>
      cache.get(`${name}:${JSON.stringify(args)}`, () => call(...args))
  return {
    compare: memo('compare', client.compare.bind(client)),
    mergedPulls: memo('mergedPulls', client.mergedPulls.bind(client)),
    openPulls: memo('openPulls', client.openPulls.bind(client)),
    mergeable: memo('mergeable', client.mergeable.bind(client)),
    branches: memo('branches', client.branches.bind(client)),
    checkRuns: memo('checkRuns', client.checkRuns.bind(client)),
    tags: memo('tags', client.tags.bind(client)),
    branchHead: memo('branchHead', client.branchHead.bind(client)),
    pull: memo('pull', client.pull.bind(client)),
    reviews: memo('reviews', client.reviews.bind(client)),
    workflowRuns: memo('workflowRuns', client.workflowRuns.bind(client)),
    tagExists: memo('tagExists', client.tagExists.bind(client)),
  }
}
