import { z } from 'zod'
import { ChatModeIdSchema } from './chat-modes.js'
import { AskRequestSchema, AskResponseSchema, AskStreamEventSchema } from './index.js'

/**
 * index.ts re-exports this file, so the schemas reused from it are read lazily, at parse time,
 * when both modules are already loaded.
 */
const question = z.lazy(() => AskRequestSchema.shape.question)
const askResponse = z.lazy(() => AskResponseSchema)
const askStreamEvent = z.lazy(() => AskStreamEventSchema)

export const ConversationIdSchema = z.uuid()

/** A question that may continue an earlier conversation of the same person. */
export const ChatRequestSchema = z.object({
  question,
  conversationId: ConversationIdSchema.optional(),
})
export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  messageCount: z.number().int().nonnegative(),
  chatMode: ChatModeIdSchema.default('ask'),
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const ConversationMessageSchema = z.discriminatedUnion('author', [
  z.object({ author: z.literal('user'), content: z.string(), createdAt: z.iso.datetime() }),
  z.object({
    author: z.literal('assistant'),
    tools: z.array(z.string()),
    response: askResponse,
    createdAt: z.iso.datetime(),
  }),
])
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

export const ConversationSchema = ConversationSummarySchema.extend({
  messages: z.array(ConversationMessageSchema),
})
export type Conversation = z.infer<typeof ConversationSchema>

/** Sent after `done` when the turn was saved, so the client can continue the conversation. */
export const ConversationSavedEventSchema = z.object({
  type: z.literal('conversation'),
  conversation: ConversationSummarySchema,
})

/** Events of the chat stream: the answer events plus the saved conversation, when saved. */
export const ChatStreamEventSchema = z.union([askStreamEvent, ConversationSavedEventSchema])
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>
