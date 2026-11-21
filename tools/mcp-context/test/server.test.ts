import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { type Handbook, loadHandbook } from '@lab/handbook'
import { createServer } from '../src/server.js'

const LAB = fileURLToPath(new URL('../../../handbook', import.meta.url))

const connect = async (handbook: Handbook) => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createServer(handbook).connect(serverSide)
  const client = new Client({ name: 'teste', version: '1.0.0' })
  await client.connect(clientSide)
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args })
    const [first] = result.content as { type: string; text: string }[]
    return first?.text ?? ''
  }
  return { client, call }
}

describe('servidor MCP', async () => {
  const { client, call } = await connect(await loadHandbook(LAB))

  it('expõe só ferramentas de leitura', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'buscar',
      'buscar_padroes',
      'buscar_sistemas',
      'decisoes_pendentes',
      'glossario',
      'padrao',
      'regras_para_ia',
      'sistema',
    ])
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)
  })

  it('responde regras, padrões e busca de padrões com fonte', async () => {
    expect(await call('regras_para_ia')).toContain('Fonte: seção "Para IA"')
    expect(await call('padrao', { id: 'ENG-QA-01' })).toMatch(/70%[\s\S]*Fonte: 01-padroes.md/)
    expect(await call('padrao', { id: 'ENG-ZZ-99' })).toContain('não encontrado')
    expect(await call('buscar_padroes', { status: 'VIGENTE', area: 'ENG-PR' })).toBe(
      'ENG-PR-01 · Template de PR [VIGENTE]\nENG-PR-02 · Review por IA [VIGENTE]',
    )
    expect(await call('buscar_padroes', { termo: 'inexistente' })).toBe(
      'Nenhum padrão com esses filtros.',
    )
  })

  it('responde sistemas, glossário, decisões e busca livre', async () => {
    expect(await call('sistema', { nome: 'bot de review' })).toContain('Camada: Ferramentas')
    expect(await call('sistema', { nome: 'kafka' })).toContain('não encontrado')
    expect(await call('buscar_sistemas', { termo: 'fastify' })).toContain(
      'API de solicitações de campanha',
    )
    expect(await call('buscar_sistemas', { termo: 'kafka' })).toBe(
      'Nenhum sistema cita esse termo.',
    )
    expect(await call('glossario', { termo: 'golden set' })).toContain('Fonte: 03-glossario.md')
    expect(await call('glossario', { termo: 'zzz' })).toContain('não encontrado')
    expect(await call('decisoes_pendentes', { prioridade: 1 })).toContain('P1 ENG-PR-03')
    expect(await call('decisoes_pendentes', { prioridade: 2 })).toBe(
      'Nenhuma decisão pendente com esse filtro.',
    )
    expect(await call('decisoes_pendentes')).toContain('IA-02')
    expect(await call('buscar', { consulta: 'segredo prompt' })).toContain('[01-padroes.md')
    expect(await call('buscar', { consulta: 'xyzxyz' })).toBe(
      'Nada encontrado no handbook para essa consulta.',
    )
  })
})

describe('servidor sem seção Para IA', () => {
  it('avisa que a seção não existe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hb-'))
    await writeFile(join(dir, 'a.md'), '# A\n')
    const { call } = await connect(await loadHandbook(dir))
    expect(await call('regras_para_ia')).toBe('O handbook não tem a seção "Para IA".')
  })
})
