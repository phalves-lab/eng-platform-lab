import type { CampaignRequest } from './campaign-request.js'

export interface CampaignRequestRepository {
  insert(request: CampaignRequest): Promise<void>
  findById(id: string): Promise<CampaignRequest | null>
  update(request: CampaignRequest): Promise<void>
}

export class InMemoryCampaignRequestRepository implements CampaignRequestRepository {
  private readonly items = new Map<string, CampaignRequest>()

  async insert(request: CampaignRequest): Promise<void> {
    this.items.set(request.id, structuredClone(request))
  }

  async findById(id: string): Promise<CampaignRequest | null> {
    const found = this.items.get(id)
    return found ? structuredClone(found) : null
  }

  async update(request: CampaignRequest): Promise<void> {
    this.items.set(request.id, structuredClone(request))
  }
}
