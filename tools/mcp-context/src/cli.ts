#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadHandbook } from './handbook.js'
import { createServer } from './server.js'

const defaultDirectory = fileURLToPath(new URL('../../../handbook', import.meta.url))

const main = async () => {
  const directory = resolve(process.argv[2] ?? process.env.MARTECH_HANDBOOK_DIR ?? defaultDirectory)
  const handbook = await loadHandbook(directory)
  const server = createServer(handbook)
  await server.connect(new StdioServerTransport())
  console.error(
    `martech-context: ${handbook.standards.length} padrões, ${handbook.systems.length} sistemas, ${handbook.glossary.length} termos em ${directory}`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
