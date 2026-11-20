import { describe, expect, it, vi } from 'vitest'
import {
  decideWrite,
  describePlan,
  executeWritePlan,
  type WritePlan,
} from '../src/atlassian-write.js'
import { ReadOnlyHttp, WriteAttemptError } from '../src/sources/read-only-http.js'

const plan: WritePlan = {
  kind: 'jira-comment',
  target: 'ABC-1234',
  body: 'Primeiro parágrafo.\n\nSegundo.',
}

const env = (overrides: Partial<Parameters<typeof decideWrite>[1]> = {}) => ({
  confirmFlag: true,
  isTTY: true,
  isCI: false,
  ask: vi.fn(async () => 'ABC-1234'),
  ...overrides,
})

describe('decideWrite', () => {
  it('bloqueia em CI mesmo com --confirm', async () => {
    const e = env({ isCI: true })
    expect(await decideWrite(plan, e)).toEqual({ execute: false, reason: 'ci' })
    expect(e.ask).not.toHaveBeenCalled()
  })

  it('simula quando falta --confirm', async () => {
    expect(await decideWrite(plan, env({ confirmFlag: false }))).toEqual({
      execute: false,
      reason: 'dry-run',
    })
  })

  it('exige terminal interativo', async () => {
    expect(await decideWrite(plan, env({ isTTY: false }))).toEqual({
      execute: false,
      reason: 'no-tty',
    })
  })

  it('recusa quando a confirmação não bate com o alvo', async () => {
    expect(await decideWrite(plan, env({ ask: vi.fn(async () => 'sim') }))).toEqual({
      execute: false,
      reason: 'not-confirmed',
    })
  })

  it('executa só com --confirm, terminal, fora de CI e alvo digitado', async () => {
    expect(await decideWrite(plan, env({ ask: vi.fn(async () => '  ABC-1234 ') }))).toEqual({
      execute: true,
    })
  })
})

describe('executeWritePlan', () => {
  const options = { site: 'exemplo.atlassian.net', email: 'a@b.c', apiToken: 't' }

  it('cria comentário no Jira em ADF', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }))
    await executeWritePlan(plan, { ...options, fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://exemplo.atlassian.net/rest/api/3/issue/ABC-1234/comment')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string).body.content).toHaveLength(2)
  })

  it('atualiza página do Confluence incrementando a versão', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: { number: 7 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await executeWritePlan(
      { kind: 'confluence-update', target: '123', title: 'Módulo', storageBody: '<p>novo</p>' },
      { ...options, fetchImpl },
    )
    const [, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string).version.number).toBe(8)
  })

  it('propaga erro do Atlassian', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }))
    await expect(executeWritePlan(plan, { ...options, fetchImpl })).rejects.toThrow('403')
  })

  it('descreve o plano antes de executar', () => {
    expect(describePlan(plan)).toContain('ABC-1234')
    expect(
      describePlan({ kind: 'confluence-update', target: '9', title: 'T', storageBody: '<p/>' }),
    ).toContain('página 9')
  })
})

describe('ReadOnlyHttp', () => {
  const http = (fetchImpl: typeof fetch) =>
    new ReadOnlyHttp({
      baseUrl: 'https://exemplo.atlassian.net',
      email: 'a@b.c',
      apiToken: 't',
      fetchImpl,
    })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'recusa %s antes de qualquer chamada de rede',
    async (method) => {
      const fetchImpl = vi.fn()
      await expect(http(fetchImpl).request(method, '/rest/api/3/issue/X-1')).rejects.toBeInstanceOf(
        WriteAttemptError,
      )
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('faz GET autenticado e devolve null em 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    expect(await http(fetchImpl).getJson('/x')).toBeNull()
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /)
  })

  it('lança erro em resposta não 2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }))
    await expect(http(fetchImpl).getJson('/x')).rejects.toThrow('500')
  })
})
