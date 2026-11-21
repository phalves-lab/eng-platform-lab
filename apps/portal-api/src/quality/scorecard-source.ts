import { readFile, stat } from 'node:fs/promises'
import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { type ScorecardReport, ScorecardReportSchema } from '@lab/contracts'

export const SCORECARD_SOURCE = Symbol('SCORECARD_SOURCE')

export interface ScorecardSource {
  load: () => Promise<ScorecardReport>
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    return { invalidJson: error instanceof Error ? error.message : String(error) }
  }
}

/** Reads the file written by the scorecard collector, reloading it only when the file changes. */
export class FileScorecardSource implements ScorecardSource {
  private readonly logger = new Logger('Scorecard')
  private cache: { mtime: number; report: ScorecardReport } | null = null

  constructor(private readonly path: string) {}

  async load(): Promise<ScorecardReport> {
    let mtime: number
    try {
      mtime = (await stat(this.path)).mtimeMs
    } catch {
      throw new ServiceUnavailableException('O scorecard ainda não foi gerado pelo coletor')
    }
    if (this.cache?.mtime === mtime) return this.cache.report
    const parsed = ScorecardReportSchema.safeParse(parseJson(await readFile(this.path, 'utf8')))
    if (!parsed.success) {
      this.logger.error(`Invalid scorecard file ${this.path}: ${parsed.error.message}`)
      throw new ServiceUnavailableException('O arquivo do scorecard está inválido')
    }
    this.cache = { mtime, report: parsed.data }
    return parsed.data
  }
}
