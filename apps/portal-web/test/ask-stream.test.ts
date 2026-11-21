import { encodeSseEvent, type ChatStreamEvent, type Citation } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  finishTurn,
  newTurn,
  readAskStream,
  validatedAskStream,
} from '../src/lib/ask-stream'
import { citationHref, TOOL_LABEL } from '../src/lib/citations'

const bytes = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })

const answer = {
  mode: 'llm' as const,
  answer: 'Use ENG-GIT-02.',
  citations: [{ kind: 'standard' as const, ref: 'ENG-GIT-02', label: 'ENG-GIT-02', source: 'a' }],
}

describe('resposta em streaming', () => {
  it('lê os eventos válidos, mesmo quebrados entre pedaços, e ignora o resto', async () => {
    const wire = [
      encodeSseEvent({ type: 'start', mode: 'llm' }),
      'data: não é json\n\n',
      encodeSseEvent({ type: 'desconhecido' }),
      encodeSseEvent({ type: 'delta', text: 'Use ' }),
      encodeSseEvent({ type: 'done', response: answer }),
    ].join('')
    const events: ChatStreamEvent[] = []
    await readAskStream(bytes(wire.slice(0, 20), wire.slice(20)), (event) => events.push(event))
    expect(events.map((e) => e.type)).toEqual(['start', 'delta', 'done'])
  })

  it('repassa o aviso de conversa salva junto com os eventos da resposta', async () => {
    const saved = {
      type: 'conversation',
      conversation: {
        id: '0f8b2c64-8f3e-4b8e-9d5a-2f1e6c7b9a10',
        title: 'Pergunta',
        createdAt: '2026-11-21T12:00:00.000Z',
        updatedAt: '2026-11-21T12:00:00.000Z',
        messageCount: 2,
        chatMode: 'refine-task',
      },
    }
    const upstream = bytes(
      encodeSseEvent({ type: 'done', response: answer }) + encodeSseEvent(saved),
    )
    const relayed = upstream.pipeThrough(validatedAskStream())
    const events: ChatStreamEvent[] = []
    await readAskStream(relayed, (event) => events.push(event))
    expect(events.map((e) => e.type)).toEqual(['done', 'conversation'])
    expect(events[1]).toEqual(saved)
  })

  it('revalida o stream da API antes de repassar ao navegador', async () => {
    const upstream = bytes(
      encodeSseEvent({ type: 'tool', name: 'padrao' }) + encodeSseEvent({ type: 'x' }),
    )
    const text = await new Response(upstream.pipeThrough(validatedAskStream())).text()
    expect(text).toBe(encodeSseEvent({ type: 'tool', name: 'padrao' }))
  })

  it('monta a resposta evento a evento e fecha a que ficou pela metade', () => {
    let turn = newTurn(1, 'pergunta')
    turn = applyEvent(turn, { type: 'start', mode: 'llm' })
    turn = applyEvent(turn, { type: 'tool', name: 'padrao' })
    turn = applyEvent(turn, { type: 'tool', name: 'padrao' })
    turn = applyEvent(turn, { type: 'delta', text: 'Use ' })
    expect(turn).toMatchObject({
      mode: 'llm',
      tools: ['padrao'],
      text: 'Use ',
      status: 'streaming',
    })
    expect(finishTurn(turn)).toMatchObject({ status: 'error', error: expect.any(String) })

    const done = applyEvent(turn, { type: 'done', response: answer })
    expect(done).toMatchObject({ text: 'Use ENG-GIT-02.', status: 'done', response: answer })
    expect(finishTurn(done)).toBe(done)
    expect(applyEvent(turn, { type: 'error', message: 'parou' })).toMatchObject({
      status: 'error',
      error: 'parou',
      text: 'Use ',
    })
  })

  it('liga cada citação à página do portal', () => {
    const cite = (kind: Citation['kind'], ref: string): Citation => ({
      kind,
      ref,
      label: ref,
      source: 's',
    })
    expect(citationHref(cite('standard', 'ENG-GIT-02'))).toBe('/padroes/ENG-GIT-02')
    expect(citationHref(cite('system', 'bot-de-review'))).toBe('/sistemas/bot-de-review')
    expect(citationHref(cite('term', 'Merge queue, fila'))).toBe(
      '/glossario?termo=Merge%20queue%2C%20fila',
    )
    expect(citationHref(cite('passage', 'a.md › Times'))).toBeNull()
    expect(Object.keys(TOOL_LABEL)).toHaveLength(8)
  })
})
