import type { EvalRunSource } from '@lab/database'
import type { ParsedArtifact } from '@lab/llm-usage'

export interface CollectedArtifacts {
  source: Exclude<EvalRunSource, 'local'>
  parsed: ParsedArtifact[]
  failures: string[]
}

/** Reads the eval and usage artifacts written by the bot and chat runners. */
export interface AiArtifactSource {
  collect: () => Promise<CollectedArtifacts>
}
