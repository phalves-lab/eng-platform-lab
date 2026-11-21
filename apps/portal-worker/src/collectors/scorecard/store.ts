import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type ScorecardReport, ScorecardReportSchema } from '@lab/contracts'

export interface ScorecardStore {
  save: (report: ScorecardReport) => Promise<void>
}

/** Writes the report next to the portal data; the rename keeps readers from seeing half a file. */
export const createFileScorecardStore = (path: string): ScorecardStore => ({
  save: async (report) => {
    const valid = ScorecardReportSchema.parse(report)
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  },
})
