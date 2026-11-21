import {
  type AskMode,
  type AskResponse,
  type AskStreamEvent,
  type ChatStreamEvent,
  ChatStreamEventSchema,
  createSseParser,
  encodeSseEvent,
} from '@lab/contracts'

type TurnStatus = 'streaming' | 'done' | 'error' | 'cancelled'

export interface Turn {
  id: number
  question: string
  mode: AskMode | null
  text: string
  tools: string[]
  response: AskResponse | null
  error: string | null
  status: TurnStatus
}

const INCOMPLETE = 'A resposta chegou incompleta. Tente de novo.'

export const newTurn = (id: number, question: string): Turn => ({
  id,
  question,
  mode: null,
  text: '',
  tools: [],
  response: null,
  error: null,
  status: 'streaming',
})

const parseEvent = (payload: string): ChatStreamEvent | null => {
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return null
  }
  const parsed = ChatStreamEventSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** Folds one streamed event into the turn being answered. */
export const applyEvent = (turn: Turn, event: AskStreamEvent): Turn => {
  switch (event.type) {
    case 'start':
      return { ...turn, mode: event.mode }
    case 'tool':
      return turn.tools.includes(event.name)
        ? turn
        : { ...turn, tools: [...turn.tools, event.name] }
    case 'delta':
      return { ...turn, text: turn.text + event.text }
    case 'done':
      return {
        ...turn,
        mode: event.response.mode,
        text: event.response.answer,
        response: event.response,
        status: 'done',
      }
    case 'error':
      return { ...turn, error: event.message, status: 'error' }
  }
}

/** Closes a turn whose stream ended; a turn still streaming at that point lost its last event. */
export const finishTurn = (turn: Turn): Turn =>
  turn.status === 'streaming' ? { ...turn, error: INCOMPLETE, status: 'error' } : turn

/** Reads an answer stream and hands every event that matches the contract to `onEvent`. */
export const readAskStream = async (
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
) => {
  const read = createSseParser()
  const decoder = new TextDecoder()
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    for (const payload of read(decoder.decode(value, { stream: true }))) {
      const event = parseEvent(payload)
      if (event) onEvent(event)
    }
  }
}

/** Re-validates the events coming from portal-api before they reach the browser. */
export const validatedAskStream = () => {
  const read = createSseParser()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      for (const payload of read(decoder.decode(chunk, { stream: true }))) {
        const event = parseEvent(payload)
        if (event) controller.enqueue(encoder.encode(encodeSseEvent(event)))
      }
    },
  })
}
