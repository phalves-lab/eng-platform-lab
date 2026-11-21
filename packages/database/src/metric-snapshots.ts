import type pg from 'pg'
import { toIso } from './rows.js'
import {
  type MetricSnapshot,
  MetricSnapshotSchema,
  type SnapshotPayload,
  SnapshotPayloadSchema,
} from './schemas.js'

interface Row {
  dataset: string
  day: string
  payload: unknown
  collected_at: Date
}

const COLUMNS = `dataset, to_char(day, 'YYYY-MM-DD') AS day, payload, collected_at`

const toSnapshot = (row: Row): MetricSnapshot => {
  const payload = SnapshotPayloadSchema.safeParse(row.payload)
  if (!payload.success) {
    throw new Error(`Snapshot ${row.dataset}/${row.day} has an invalid payload`, {
      cause: payload.error,
    })
  }
  return {
    dataset: row.dataset,
    day: row.day,
    payload: payload.data,
    collectedAt: toIso(row.collected_at),
  }
}

export interface SaveSnapshotInput {
  day: string
  payload: SnapshotPayload
  collectedAt: string
}

/** One snapshot per dataset and day; a later run on the same day replaces the earlier one. */
export class MetricSnapshotRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(input: SaveSnapshotInput): Promise<MetricSnapshot> {
    const snapshot = MetricSnapshotSchema.parse({ ...input, dataset: input.payload.id })
    const result = await this.pool.query<Row>(
      `INSERT INTO metric_snapshots (dataset, day, payload, collected_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dataset, day)
       DO UPDATE SET payload = EXCLUDED.payload, collected_at = EXCLUDED.collected_at
       RETURNING ${COLUMNS}`,
      [snapshot.dataset, snapshot.day, JSON.stringify(snapshot.payload), snapshot.collectedAt],
    )
    return toSnapshot(result.rows[0] as Row)
  }

  async latest(): Promise<MetricSnapshot[]> {
    const result = await this.pool.query<Row>(
      `SELECT DISTINCT ON (dataset) ${COLUMNS}
       FROM metric_snapshots
       ORDER BY dataset, day DESC, collected_at DESC`,
    )
    return result.rows.map(toSnapshot)
  }

  async find(dataset: string, day: string): Promise<MetricSnapshot | null> {
    const result = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM metric_snapshots WHERE dataset = $1 AND day = $2`,
      [dataset, day],
    )
    const row = result.rows[0]
    return row ? toSnapshot(row) : null
  }
}
