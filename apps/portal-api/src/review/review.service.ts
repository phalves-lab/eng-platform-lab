import { readFile, stat } from 'node:fs/promises'
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { PanelData, PanelDataset } from '@lab/eng-metrics/contract'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { buildMyQueue, type MyQueue } from './my-queue.js'

/** Serves the collector output (`data.json`), reloading it only when the file changes. */
@Injectable()
export class ReviewService {
  private cache: { mtime: number; data: PanelData } | null = null

  constructor(@Inject(CONFIG) private readonly config: PortalConfig) {}

  private async load(): Promise<PanelData> {
    let mtime: number
    try {
      mtime = (await stat(this.config.panelDataPath)).mtimeMs
    } catch {
      throw new ServiceUnavailableException('Delivery data is not available yet')
    }
    if (this.cache?.mtime === mtime) return this.cache.data
    const data = JSON.parse(await readFile(this.config.panelDataPath, 'utf8')) as PanelData
    this.cache = { mtime, data }
    return data
  }

  async datasets(): Promise<{ id: string; title: string; label: string; generatedAt: string }[]> {
    const data = await this.load()
    return data.datasets.map(({ id, title, label, generatedAt }) => ({
      id,
      title,
      label,
      generatedAt,
    }))
  }

  async dataset(id: string): Promise<PanelDataset> {
    const data = await this.load()
    const found = data.datasets.find((dataset) => dataset.id === id)
    if (!found) throw new NotFoundException(`Dataset ${id} not found`)
    return found
  }

  async myQueue(datasetId: string, login: string): Promise<MyQueue & { dataset: string }> {
    const dataset = await this.dataset(datasetId)
    return { dataset: dataset.id, ...buildMyQueue(dataset.queue, login) }
  }
}
