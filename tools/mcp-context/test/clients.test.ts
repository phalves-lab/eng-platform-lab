import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { loadHandbook } from '@lab/handbook'
import { createServer } from '../src/server.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

interface KiroConfig {
  mcpServers: Record<string, { command: string; args: string[]; autoApprove?: string[] }>
}

const kiro = JSON.parse(readFileSync(`${ROOT}.kiro/settings/mcp.json`, 'utf8')) as KiroConfig

const toolNames = async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createServer(await loadHandbook(`${ROOT}handbook`)).connect(serverSide)
  const client = new Client({ name: 'teste', version: '1.0.0' })
  await client.connect(clientSide)
  const { tools } = await client.listTools()
  return tools
}

describe('configuração do Kiro', () => {
  const server = kiro.mcpServers['martech-context']

  it('aponta para o CLI do servidor dentro do repositório', () => {
    expect(server?.command).toBe('npx')
    const script = server?.args.at(-1) ?? ''
    expect(existsSync(`${ROOT}${script}`)).toBe(true)
  })

  it('aprova automaticamente só as ferramentas de leitura que o servidor expõe', async () => {
    const tools = await toolNames()
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    expect([...(server?.autoApprove ?? [])].sort()).toEqual(tools.map((tool) => tool.name).sort())
  })

  it('tem steering que manda chamar as regras no começo da tarefa', () => {
    const steering = readFileSync(`${ROOT}.kiro/steering/handbook.md`, 'utf8')
    expect(steering).toMatch(/^---\ninclusion: always\n---/)
    expect(steering).toContain('regras_para_ia')
  })
})
