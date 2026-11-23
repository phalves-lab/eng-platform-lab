import { AsyncLocalStorage } from 'node:async_hooks'

interface AuditScope {
  releaseRunId: number | null
}

const storage = new AsyncLocalStorage<AuditScope>()

/** Runs `work` with a fresh audit scope that the code below can enrich while handling the request. */
export const withAuditScope = <T>(work: (scope: AuditScope) => T): T => {
  const scope: AuditScope = { releaseRunId: null }
  return storage.run(scope, () => work(scope))
}

/**
 * Points the audit event of the current request to the `release_runs` row that holds the detail,
 * so the general trail does not copy the plan or the result. Outside a request it does nothing.
 */
export const linkReleaseRun = (id: number) => {
  const scope = storage.getStore()
  if (scope) scope.releaseRunId = id
}
