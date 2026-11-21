import { createSseParser } from '@lab/contracts'
import { z } from 'zod'
import type {
  ChatMessage,
  ModelProvider,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from './model-provider.js'

export interface OpenAICompatibleOptions {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
}

export class ModelHttpError extends Error {
  constructor(readonly status: number) {
    super(`model gateway answered ${status}`)
    this.name = 'ModelHttpError'
  }
}

const ToolCallDeltaSchema = z.object({
  index: z.number().int().default(0),
  id: z.string().optional(),
  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
})

const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            tool_calls: z.array(ToolCallDeltaSchema).nullish(),
          })
          .default({}),
      }),
    )
    .default([]),
})

const CompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string().default('{}') }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
})

const toWire = (message: ChatMessage) => {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content || null,
      ...(message.toolCalls.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    }
  }
  return message
}

class StreamedTurn {
  private content = ''
  private readonly calls = new Map<number, ToolCall>()

  constructor(private readonly onDelta: (text: string) => void) {}

  apply(payload: string) {
    const chunk = ChunkSchema.safeParse(JSON.parse(payload))
    if (!chunk.success) return
    for (const { delta } of chunk.data.choices) {
      if (delta.content) {
        this.content += delta.content
        this.onDelta(delta.content)
      }
      for (const part of delta.tool_calls ?? []) {
        const call = this.calls.get(part.index) ?? { id: '', name: '', arguments: '' }
        this.calls.set(part.index, {
          id: part.id ?? call.id,
          name: call.name + (part.function?.name ?? ''),
          arguments: call.arguments + (part.function?.arguments ?? ''),
        })
      }
    }
  }

  result(): ModelTurn {
    const toolCalls = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }))
    return { content: this.content, toolCalls }
  }
}

/**
 * Talks to any gateway that implements the OpenAI chat completions API, streaming text and
 * tool calls. Gateways that ignore `stream` and answer with plain JSON are also accepted.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.model = options.model
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async complete({ messages, tools, signal, onDelta }: ModelRequest): Promise<ModelTurn> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        temperature: 0.1,
        messages: messages.map(toWire),
        ...(tools.length
          ? {
              tools: tools.map((tool) => ({ type: 'function', function: tool })),
              tool_choice: 'auto',
            }
          : {}),
      }),
      signal,
    })
    if (!response.ok || !response.body) throw new ModelHttpError(response.status)

    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      return this.fromJson(await response.json(), onDelta)
    }

    const turn = new StreamedTurn(onDelta)
    const read = createSseParser()
    const decoder = new TextDecoder()
    for await (const bytes of response.body) {
      for (const payload of read(decoder.decode(bytes, { stream: true }))) {
        if (payload === '[DONE]') return turn.result()
        turn.apply(payload)
      }
    }
    return turn.result()
  }

  private fromJson(body: unknown, onDelta: (text: string) => void): ModelTurn {
    const message = CompletionSchema.parse(body).choices[0]?.message
    const content = message?.content ?? ''
    if (content) onDelta(content)
    return {
      content,
      toolCalls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
    }
  }
}
