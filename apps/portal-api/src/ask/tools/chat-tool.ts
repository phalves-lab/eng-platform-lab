import type { Citation } from '@lab/contracts'
import { type Handbook, handbookTools } from '@lab/handbook'
import { z } from 'zod'
import type { ToolSpec } from '../model/model-provider.js'

export interface ToolOutput {
  text: string
  citations: Citation[]
}

/** Extra read-only tools of the ask mode that read portal data beyond the handbook. */
export const CHAT_TOOLS = Symbol('CHAT_TOOLS')

/** A read-only tool the chat model may call. */
export interface ChatTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** Validates the raw arguments sent by the model and runs the tool; failures come back as text. */
  call: (args: unknown, signal: AbortSignal) => Promise<ToolOutput>
}

interface ToolDefinition<Input extends z.ZodObject> {
  name: string
  description: string
  input: Input
  run: (args: z.output<Input>, signal: AbortSignal) => Promise<ToolOutput> | ToolOutput
}

const toParameters = (input: z.ZodObject): Record<string, unknown> => {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(input) }
  delete schema['$schema']
  return schema
}

const failureText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const textOutput = (text: string): ToolOutput => ({ text, citations: [] })

export const defineTool = <Input extends z.ZodObject>(
  definition: ToolDefinition<Input>,
): ChatTool => ({
  name: definition.name,
  description: definition.description,
  parameters: toParameters(definition.input),
  call: async (args, signal) => {
    const parsed = definition.input.safeParse(args)
    if (!parsed.success) {
      return textOutput(
        `Argumentos inválidos para ${definition.name}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      )
    }
    try {
      return await definition.run(parsed.data, signal)
    } catch (error) {
      return textOutput(`Não foi possível ler ${definition.name} agora: ${failureText(error)}`)
    }
  },
})

/** The handbook tools of the MCP server, reading the handbook snapshot current at each call. */
export const handbookChatTools = (snapshot: () => Handbook): ChatTool[] =>
  handbookTools.map((tool) =>
    defineTool({
      name: tool.name,
      description: tool.description,
      input: tool.input,
      run: (args) => tool.execute(snapshot(), args),
    }),
  )

export const HANDBOOK_TOOL_NAMES: readonly string[] = handbookTools.map((tool) => tool.name)

export const toSpecs = (tools: readonly ChatTool[]): ToolSpec[] =>
  tools.map(({ name, description, parameters }) => ({ name, description, parameters }))
