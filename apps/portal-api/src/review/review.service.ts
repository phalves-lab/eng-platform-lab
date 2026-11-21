import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { PanelDataset } from '@lab/eng-metrics/contract'
import { buildMyQueue, type MyQueue } from './my-queue.js'
import { PANEL_SOURCE, type PanelSource } from './panel-source.js'

/** Review data for the portal, from whichever source the configuration selected. */
@Injectable()
export class ReviewService {
  constructor(@Inject(PANEL_SOURCE) private readonly source: PanelSource) {}

  async datasets(): Promise<{ id: string; title: string; label: string; generatedAt: string }[]> {
    const data = await this.source.load()
    return data.datasets.map(({ id, title, label, generatedAt }) => ({
      id,
      title,
      label,
      generatedAt,
    }))
  }

  async dataset(id: string): Promise<PanelDataset> {
    const data = await this.source.load()
    const found = data.datasets.find((dataset) => dataset.id === id)
    if (!found) throw new NotFoundException(`Dataset ${id} not found`)
    return found
  }

  async myQueue(datasetId: string, login: string): Promise<MyQueue & { dataset: string }> {
    const dataset = await this.dataset(datasetId)
    return { dataset: dataset.id, ...buildMyQueue(dataset.queue, login) }
  }
}
