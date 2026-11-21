import { describe, expect, it } from 'vitest'
import {
  ModelHttpError,
  OpenAICompatibleProvider,
} from '../src/ask/model/openai-compatible.provider.js'
import type { ModelRequest } from '../src/ask/model/model-provider.js'

const sse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )

const event = (delta: unknown) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

const capture = (response: Response) => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response
  }) as unknown as typeof fetch
  const provider = new OpenAICompatibleProvider({
    baseUrl: 'https://llm.example.invalid/v1',
    apiKey: 'test-key',
    model: 'modelo-sintetico',
    fetchImpl,
  })
  return { provider, calls }
}

const baseRequest = (deltas: string[]): ModelRequest => ({
  messages: [
    { role: 'system', content: 'regras' },
    { role: 'user', content: 'pergunta' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'padrao', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c1', content: 'resultado' },
  ],
  tools: [{ name: 'padrao', description: 'Padrão por ID', parameters: { type: 'object' } }],
  signal: new AbortController().signal,
  onDelta: (text) => deltas.push(text),
})

describe('provider compatível com OpenAI', () => {
  it('envia mensagens e ferramentas e junta texto e chamadas transmitidos em pedaços', async () => {
    const wire = [
      event({ content: 'Olá, ' }),
      event({ content: 'mundo.' }),
      event({
        tool_calls: [{ index: 0, id: 'x1', function: { name: 'pad', arguments: '{"id"' } }],
      }),
      event({ tool_calls: [{ index: 0, function: { name: 'rao', arguments: ':"ENG-QA-01"}' } }] }),
      event({ tool_calls: [{ index: 1, function: { name: 'buscar', arguments: '{}' } }] }),
      'data: {"sem":"choices"}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const { provider, calls } = capture(sse([wire.slice(0, 37), wire.slice(37)]))
    const deltas: string[] = []

    const turn = await provider.complete(baseRequest(deltas))

    expect(deltas).toEqual(['Olá, ', 'mundo.'])
    expect(turn).toEqual({
      content: 'Olá, mundo.',
      toolCalls: [
        { id: 'x1', name: 'padrao', arguments: '{"id":"ENG-QA-01"}' },
        { id: 'call_1', name: 'buscar', arguments: '{}' },
      ],
    })
    const [sent] = calls
    expect(sent?.url).toBe('https://llm.example.invalid/v1/chat/completions')
    expect((sent?.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const body = JSON.parse(String(sent?.init.body))
    expect(body).toMatchObject({ model: 'modelo-sintetico', stream: true, tool_choice: 'auto' })
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'padrao', description: 'Padrão por ID', parameters: { type: 'object' } },
    })
    expect(body.messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'padrao', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'resultado' },
    ])
  })

  it('aceita fim de stream sem [DONE] e não manda ferramentas quando não há', async () => {
    const { provider, calls } = capture(sse([event({ content: 'fim' })]))
    const turn = await provider.complete({ ...baseRequest([]), tools: [] })
    expect(turn).toEqual({ content: 'fim', toolCalls: [] })
    expect(JSON.parse(String(calls[0]?.init.body)).tools).toBeUndefined()
  })

  it('aceita resposta JSON de gateway que ignora streaming', async () => {
    const json = Response.json({
      choices: [
        {
          message: {
            content: 'Resposta inteira',
            tool_calls: [
              { id: 't1', function: { name: 'buscar', arguments: '{"consulta":"pr"}' } },
            ],
          },
        },
      ],
    })
    const deltas: string[] = []
    const { provider } = capture(json)
    expect(await provider.complete(baseRequest(deltas))).toEqual({
      content: 'Resposta inteira',
      toolCalls: [{ id: 't1', name: 'buscar', arguments: '{"consulta":"pr"}' }],
    })
    expect(deltas).toEqual(['Resposta inteira'])
    const empty = capture(Response.json({ choices: [{ message: { content: null } }] }))
    expect(await empty.provider.complete(baseRequest([]))).toEqual({ content: '', toolCalls: [] })
  })

  it('pede e devolve a contagem de tokens quando o gateway informa', async () => {
    const usage = { prompt_tokens: 120, completion_tokens: 30 }
    const wire = [event({ content: 'ok' }), `data: ${JSON.stringify({ choices: [], usage })}\n\n`]
    const streamed = capture(sse([wire.join('')]))
    expect(await streamed.provider.complete(baseRequest([]))).toEqual({
      content: 'ok',
      toolCalls: [],
      usage: { promptTokens: 120, completionTokens: 30 },
    })
    expect(JSON.parse(String(streamed.calls[0]?.init.body)).stream_options).toEqual({
      include_usage: true,
    })

    const json = capture(Response.json({ choices: [{ message: { content: 'ok' } }], usage }))
    expect((await json.provider.complete(baseRequest([]))).usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
    })
  })

  it('falha com o status quando o gateway recusa, sem expor a chave', async () => {
    const { provider } = capture(new Response('chave inválida', { status: 401 }))
    const error = await provider.complete(baseRequest([])).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ModelHttpError)
    expect((error as ModelHttpError).status).toBe(401)
    expect(String(error)).not.toContain('test-key')
  })
})
