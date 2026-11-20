export class DataBoundaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataBoundaryError'
  }
}

export interface LlmCallIntent {
  confidential: boolean
  dryRun: boolean
  provider: 'lab'
}

/**
 * Dado de empresa (task real, PR real, código real) nunca vai para o LLM do laboratório,
 * que usa chave pessoal. Com dado confidencial só é permitido montar o prompt (dry-run);
 * a chamada ao modelo com esse dado roda apenas no provedor contratado pela empresa.
 */
export const assertDataBoundary = (intent: LlmCallIntent): void => {
  if (intent.confidential && !intent.dryRun) {
    throw new DataBoundaryError(
      'Dado confidencial não vai para o LLM do laboratório. Use --dry-run; a chamada ao modelo com dado real roda só no provedor da empresa.',
    )
  }
}
