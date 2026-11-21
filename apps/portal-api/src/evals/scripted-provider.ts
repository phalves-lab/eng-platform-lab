import type {
  ChatMessage,
  ModelProvider,
  ModelRequest,
  ModelTurn,
} from '../ask/model/model-provider.js'
import type { OfflineScript } from './golden-set.js'

const estimateTokens = (text: string) => Math.ceil(text.length / 4)

const promptTokens = (messages: ChatMessage[]) =>
  messages.reduce((total, message) => total + estimateTokens(message.content), 0)

/**
 * Offline stand-in for the chat model: on the first round it asks for the scripted tool calls,
 * then streams the scripted answer. Tools still run against the real handbook, so citations and
 * tool errors are the same the model would get. Token counts are estimates.
 */
export class ScriptedProvider implements ModelProvider {
  readonly model = 'roteiro-offline'
  private script: OfflineScript | null = null
  private round = 0

  use(script: OfflineScript) {
    this.script = script
    this.round = 0
  }

  async complete({ messages, tools, onDelta }: ModelRequest): Promise<ModelTurn> {
    if (!this.script) throw new Error('No offline script loaded')
    const round = this.round
    this.round += 1
    const prompt = promptTokens(messages)
    if (round === 0 && this.script.calls.length && tools.length) {
      const toolCalls = this.script.calls.map((call, index) => ({
        id: `roteiro-${index}`,
        name: call.tool,
        arguments: JSON.stringify(call.args),
      }))
      return {
        content: '',
        toolCalls,
        usage: {
          promptTokens: prompt,
          completionTokens: estimateTokens(JSON.stringify(toolCalls)),
        },
      }
    }
    onDelta(this.script.answer)
    return {
      content: this.script.answer,
      toolCalls: [],
      usage: { promptTokens: prompt, completionTokens: estimateTokens(this.script.answer) },
    }
  }
}
