import {
  type ReleaseRunFilter,
  type ReleaseRunInput,
  ReleaseRunInputSchema,
  type StoredReleaseRun,
} from '@lab/database'
import type { ReleaseRunStore } from '../src/releases/run-store.js'

/** Audit store kept in memory, with the same JSON round trip and ordering as Postgres. */
export class MemoryReleaseRunStore implements ReleaseRunStore {
  readonly runs: StoredReleaseRun[] = []

  async record(input: ReleaseRunInput) {
    const parsed = ReleaseRunInputSchema.parse(JSON.parse(JSON.stringify(input)))
    const run = {
      ...parsed,
      id: this.runs.length + 1,
      createdAt: new Date(Date.UTC(2026, 10, 21, 12, 0, this.runs.length)).toISOString(),
    }
    this.runs.push(run)
    return run
  }

  async list(filter: ReleaseRunFilter) {
    return this.runs
      .filter((run) => run.projectId === filter.projectId)
      .filter((run) => !filter.action || run.action === filter.action)
      .sort((a, b) => b.id - a.id)
      .slice(0, filter.limit ?? 50)
  }
}
