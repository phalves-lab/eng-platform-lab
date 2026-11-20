import { reviewSchema, verificationSchema, type Review, type Verification } from '../review.js'

export interface LlmProvider {
  readonly model: string
  review(prompt: string): Promise<Review>
  verify(prompt: string): Promise<Verification>
}

export interface GeminiOptions {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

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
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
      },
    )
    if (!response.ok) {
      throw new Error(
        `Gemini respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`,
      )
    }
    const data = (await response.json()) as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    return JSON.parse(text)
  }
}
