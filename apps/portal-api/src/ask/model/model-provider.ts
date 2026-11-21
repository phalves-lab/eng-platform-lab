export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER')

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON text produced by the model; it may be invalid and is parsed by the caller. */
  arguments: string
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ModelRequest {
  messages: ChatMessage[]
  tools: ToolSpec[]
  signal: AbortSignal
  onDelta: (text: string) => void
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface ModelTurn {
  content: string
  toolCalls: ToolCall[]
  /** Token counts reported by the gateway, when it reports them. */
  usage?: TokenUsage
}

/**
 * One round trip to a chat model. Text is streamed through `onDelta` as it arrives; the
 * returned turn holds the full text and the tool calls the model asked for, if any.
 */
export interface ModelProvider {
  readonly model: string
  complete(request: ModelRequest): Promise<ModelTurn>
}
