import { describe, expect, it, vi } from 'vitest'
import { GeminiHttpError, GeminiProvider, isRetryable } from '../src/llm/gemini.js'

const ok = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  })

const verdict = '{"verdict":"confirmado","reason":"r"}'

describe('retry do provedor', () => {
  it('classifica falhas transitórias', () => {
    expect(isRetryable(new GeminiHttpError(429, ''))).toBe(true)
    expect(isRetryable(new GeminiHttpError(503, ''))).toBe(true)
    expect(isRetryable(new GeminiHttpError(402, 'sem crédito'))).toBe(false)
    expect(isRetryable(Object.assign(new Error('t'), { name: 'TimeoutError' }))).toBe(true)
    expect(isRetryable(new SyntaxError('json'))).toBe(false)
  })

  it('tenta de novo após tempo esgotado e devolve a segunda resposta', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(ok(verdict))
    const provider = new GeminiProvider({ apiKey: 'k', model: 'm', fetchImpl, backoffMs: 0 })
    expect(await provider.verify('p')).toEqual({ verdict: 'confirmado', reason: 'r' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('não repete erro definitivo e para no limite de tentativas', async () => {
    const billing = vi.fn(async () => new Response('sem crédito', { status: 402 }))
    await expect(
      new GeminiProvider({ apiKey: 'k', model: 'm', fetchImpl: billing, backoffMs: 0 }).verify('p'),
    ).rejects.toThrow('402')
    expect(billing).toHaveBeenCalledTimes(1)

    const busy = vi.fn(async () => new Response('', { status: 503 }))
    await expect(
      new GeminiProvider({
        apiKey: 'k',
        model: 'm',
        fetchImpl: busy,
        backoffMs: 0,
        maxAttempts: 3,
      }).verify('p'),
    ).rejects.toThrow('503')
    expect(busy).toHaveBeenCalledTimes(3)
  })
})
