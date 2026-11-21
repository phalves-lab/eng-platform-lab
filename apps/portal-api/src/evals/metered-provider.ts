import type {
  ModelProvider,
  ModelRequest,
  ModelTurn,
  TokenUsage,
} from '../ask/model/model-provider.js'

/** Wraps a provider to record the user messages sent to the model and the tokens it reported. */
export class MeteredProvider implements ModelProvider {
  private inputs: string[] = []
  private usage: TokenUsage | null = null

  constructor(private readonly inner: ModelProvider) {}

  get model() {
    return this.inner.model
  }

  reset() {
    this.inputs = []
    this.usage = null
  }

  snapshot(): { modelInputs: string[]; usage: TokenUsage | null } {
    return { modelInputs: [...this.inputs], usage: this.usage }
  }

  async complete(request: ModelRequest): Promise<ModelTurn> {
    for (const message of request.messages) {
      if (message.role === 'user' && !this.inputs.includes(message.content)) {
        this.inputs.push(message.content)
      }
    }
    const turn = await this.inner.complete(request)
    if (turn.usage) {
      this.usage = {
        promptTokens: (this.usage?.promptTokens ?? 0) + turn.usage.promptTokens,
        completionTokens: (this.usage?.completionTokens ?? 0) + turn.usage.completionTokens,
      }
    }
    return turn
  }
}
