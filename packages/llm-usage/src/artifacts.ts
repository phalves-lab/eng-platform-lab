import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AI_ARTIFACT_VERSION,
  type AiArtifact,
  AiArtifactSchema,
  type AiUsageRecord,
  type EvalRun,
} from '@lab/contracts'

export type ParsedArtifact =
  { ok: true; name: string; artifact: AiArtifact } | { ok: false; name: string; error: string }

/** Parses one artifact file; a broken file becomes an error entry instead of stopping the batch. */
export const parseArtifact = (name: string, text: string): ParsedArtifact => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { ok: false, name, error: error instanceof Error ? error.message : String(error) }
  }
  const parsed = AiArtifactSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, name, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  return { ok: true, name, artifact: parsed.data }
}

export interface ArtifactBatch {
  runs: EvalRun[]
  usage: AiUsageRecord[]
  invalid: { name: string; error: string }[]
}

/** Splits parsed artifacts into eval runs and usage records, keeping the first copy of each id. */
export const mergeArtifacts = (parsed: ParsedArtifact[]): ArtifactBatch => {
  const runs = new Map<string, EvalRun>()
  const usage = new Map<string, AiUsageRecord>()
  const invalid: ArtifactBatch['invalid'] = []
  for (const entry of parsed) {
    if (!entry.ok) {
      invalid.push({ name: entry.name, error: entry.error })
      continue
    }
    if (entry.artifact.kind === 'eval-run') {
      if (!runs.has(entry.artifact.run.id)) runs.set(entry.artifact.run.id, entry.artifact.run)
      continue
    }
    for (const record of entry.artifact.records) {
      if (!usage.has(record.id)) usage.set(record.id, record)
    }
  }
  return { runs: [...runs.values()], usage: [...usage.values()], invalid }
}

/** Reads every `*.json` artifact of a folder, such as the synthetic `fixtures/ai-evals`. */
export const readArtifactDir = async (directory: string): Promise<ArtifactBatch> => {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()
  const parsed = await Promise.all(
    files.map(async (file) => parseArtifact(file, await readFile(join(directory, file), 'utf8'))),
  )
  return mergeArtifacts(parsed)
}

export const evalRunArtifact = (run: EvalRun): AiArtifact => ({
  schemaVersion: AI_ARTIFACT_VERSION,
  kind: 'eval-run',
  run,
})

export const usageArtifact = (records: AiUsageRecord[]): AiArtifact => ({
  schemaVersion: AI_ARTIFACT_VERSION,
  kind: 'ai-usage',
  records,
})
