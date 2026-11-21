import type {
  ModelProvider,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../src/ask/model/model-provider.js'

export type Step =
  | { text?: string[]; toolCalls?: ToolCall[]; failAfterText?: boolean }
  | { hang: true }
  | { fail: string }

/** Scripted model for tests: each call to `complete` plays the next step of the script. */
export class FakeProvider implements ModelProvider {
  readonly model = 'fake-model'
  readonly requests: ModelRequest[] = []
  private script: Step[] = []

  play(...steps: Step[]) {
    this.script = steps
    this.requests.length = 0
  }

  async complete(request: ModelRequest): Promise<ModelTurn> {
    this.requests.push({ ...request, messages: [...request.messages] })
    const step = this.script.shift() ?? { text: ['Fim do roteiro.'] }
    if ('hang' in step) {
      return new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason))
      })
    }
    if ('fail' in step) throw new Error(step.fail)
    for (const piece of step.text ?? []) request.onDelta(piece)
    if (step.failAfterText) throw new Error('stream broke')
    return { content: (step.text ?? []).join(''), toolCalls: step.toolCalls ?? [] }
  }
}

export const call = (name: string, args: unknown, id = `call-${name}`): ToolCall => ({
  id,
  name,
  arguments: typeof args === 'string' ? args : JSON.stringify(args),
})
