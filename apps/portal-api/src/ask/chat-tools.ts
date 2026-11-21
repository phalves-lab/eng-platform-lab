import type { ToolResult } from '@lab/handbook'
import type { z } from 'zod'

export const CHAT_TOOLS = Symbol('CHAT_TOOLS')

/**
 * Read-only tool that only the portal chat offers, because it reads portal data beyond the
 * handbook. `execute` parses its arguments with `input` and throws when they are invalid.
 */
export interface ChatTool {
  name: string
  description: string
  input: z.ZodObject
  execute(args: unknown): Promise<ToolResult>
}
