import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Handbook, handbookTools } from '@lab/handbook'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

/**
 * Read-only MCP server over the handbook. The tools are the same ones the portal chat uses,
 * and every answer cites the file and section it came from.
 */
export const createServer = (handbook: Handbook) => {
  const server = new McpServer({ name: 'martech-context', version: '0.1.0' })

  for (const tool of handbookTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: READ_ONLY,
      },
      async (args) => ({
        content: [{ type: 'text' as const, text: tool.execute(handbook, args).text }],
      }),
    )
  }

  return server
}
