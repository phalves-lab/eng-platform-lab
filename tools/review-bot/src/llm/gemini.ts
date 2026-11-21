import { reviewSchema, verificationSchema, type Review, type Verification } from '../review.js'

export interface LlmProvider {
  readonly model: string
  review(prompt: string): Promise<Review>
  verify(prompt: string): Promise<Verification>
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface GeminiOptions {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxAttempts?: number
  backoffMs?: number
  /** Receives the tokens of every answered call; thinking tokens are billed as output. */
  onUsage?: (usage: TokenUsage) => void
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
}

const usageOf = (data: GeminiResponse): TokenUsage | null => {
  const metadata = data.usageMetadata
  if (!metadata) return null
  return {
    inputTokens: metadata.promptTokenCount ?? 0,
    outputTokens: (metadata.candidatesTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0),
  }
}

export class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Gemini respondeu ${status}: ${body.slice(0, 300)}`)
    this.name = 'GeminiHttpError'
  }
}

/** Falhas transitórias que valem nova tentativa: tempo esgotado, limite de taxa e erro do servidor. */
export const isRetryable = (error: unknown): boolean => {
  if (error instanceof GeminiHttpError) return error.status === 429 || error.status >= 500
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class GeminiProvider implements LlmProvider {
  readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: GeminiOptions) {
    this.model = options.model
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async review(prompt: string): Promise<Review> {
    return reviewSchema.parse(await this.generateJson(prompt))
  }

  async verify(prompt: string): Promise<Verification> {
    return verificationSchema.parse(await this.generateJson(prompt))
  }

  private async generateJson(prompt: string): Promise<unknown> {
    const attempts = this.options.maxAttempts ?? 2
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.callOnce(prompt)
      } catch (error) {
        if (attempt >= attempts || !isRetryable(error)) throw error
        await sleep((this.options.backoffMs ?? 5_000) * attempt)
      }
    }
  }

  private async callOnce(prompt: string): Promise<unknown> {
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 300_000),
      },
    )
    if (!response.ok) throw new GeminiHttpError(response.status, await response.text())
    const data = (await response.json()) as GeminiResponse
    const usage = usageOf(data)
    if (usage) this.options.onUsage?.(usage)
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    return JSON.parse(text)
  }
}
