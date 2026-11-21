import type { ChangeInput, DeployInput } from '@lab/database'
import type { DoraRepo } from '@lab/dora'

interface CollectedDelivery {
  deploys: DeployInput[]
  changes: ChangeInput[]
}

/** Reads the production deploys and merged pull requests of one repository since a date. */
export interface DeliverySource {
  collect: (repo: DoraRepo, since: string) => Promise<CollectedDelivery>
}
