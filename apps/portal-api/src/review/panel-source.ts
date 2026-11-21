import { readFile, stat } from 'node:fs/promises'
import { type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { type MetricSnapshot, MetricSnapshotRepository, type Pool, createPool } from '@lab/database'
import type { PanelData } from '@lab/eng-metrics/contract'
import type { PortalConfig } from '../config/config.js'

export const PANEL_SOURCE = Symbol('PANEL_SOURCE')

export interface PanelSource {
  load: () => Promise<PanelData>
}

const PRIMARY_DATASET = 'lab'
const UNDEFINED_TABLE = '42P01'

const unavailable = () => new ServiceUnavailableException('Delivery data is not available yet')

/** Reads the collector output (`data.json`), reloading it only when the file changes. */
export class FilePanelSource implements PanelSource {
  private cache: { mtime: number; data: PanelData } | null = null

  constructor(private readonly path: string) {}

  async load(): Promise<PanelData> {
    let mtime: number
    try {
      mtime = (await stat(this.path)).mtimeMs
    } catch {
      throw unavailable()
    }
    if (this.cache?.mtime === mtime) return this.cache.data
    const data = JSON.parse(await readFile(this.path, 'utf8')) as PanelData
    this.cache = { mtime, data }
    return data
  }
}

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

/** The primary dataset comes first because the portal opens on the first one listed. */
const byPrimaryThenName = (a: MetricSnapshot, b: MetricSnapshot) =>
  Number(b.dataset === PRIMARY_DATASET) - Number(a.dataset === PRIMARY_DATASET) ||
  a.dataset.localeCompare(b.dataset)

/** Serves the latest stored snapshot of each dataset written by the portal worker. */
export class DatabasePanelSource implements PanelSource, OnModuleDestroy {
  constructor(
    private readonly snapshots: Pick<MetricSnapshotRepository, 'latest'>,
    private readonly pool: Pick<Pool, 'end'> | null = null,
  ) {}

  async load(): Promise<PanelData> {
    let latest: MetricSnapshot[]
    try {
      latest = await this.snapshots.latest()
    } catch (error) {
      if (isUndefinedTable(error)) throw unavailable()
      throw error
    }
    if (latest.length === 0) throw unavailable()
    const datasets = [...latest].sort(byPrimaryThenName).map((snapshot) => snapshot.payload)
    const generatedAt =
      datasets
        .map((dataset) => dataset.generatedAt)
        .sort()
        .at(-1) ?? ''
    return { schemaVersion: 1, generatedAt, datasets }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end()
  }
}

export const createPanelSource = (source: PortalConfig['panelSource']): PanelSource => {
  if (source.kind === 'file') return new FilePanelSource(source.path)
  const pool = createPool({ connectionString: source.url, applicationName: 'portal-api' })
  return new DatabasePanelSource(new MetricSnapshotRepository(pool), pool)
}
