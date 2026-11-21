import { z } from 'zod'

/** What the chat is doing: answering about the handbook or writing one kind of draft. */
export const ChatModeIdSchema = z.enum([
  'ask',
  'refine-task',
  'pr-description',
  'release-notes',
  'adr',
  'weekly-summary',
])
export type ChatModeId = z.infer<typeof ChatModeIdSchema>

export const ASK_MAX_LENGTH = 500
export const DRAFT_MAX_LENGTH = 8000

/** A marketplace skill a mode plays the role of, as found in the AI catalog. */
export const ChatModeSkillSchema = z.object({
  plugin: z.string(),
  skill: z.string(),
  description: z.string().nullable(),
  found: z.boolean(),
})
export type ChatModeSkill = z.infer<typeof ChatModeSkillSchema>

export const ChatModeSchema = z.object({
  id: ChatModeIdSchema,
  label: z.string(),
  description: z.string(),
  placeholder: z.string(),
  examples: z.array(z.string()),
  draft: z.boolean(),
  maxLength: z.number().int().positive(),
  available: z.boolean(),
  skill: ChatModeSkillSchema.nullable(),
})
export type ChatMode = z.infer<typeof ChatModeSchema>

export const ChatModesResponseSchema = z.object({ modes: z.array(ChatModeSchema) })
export type ChatModesResponse = z.infer<typeof ChatModesResponseSchema>

/**
 * A chat turn in any mode. Questions in the ask mode keep the 500 character limit; drafts take
 * pasted tasks, diffs and PR lists, so they accept up to 8000 characters.
 */
export const ModeChatRequestSchema = z
  .object({
    question: z.string().trim().min(3).max(DRAFT_MAX_LENGTH),
    conversationId: z.uuid().optional(),
    mode: ChatModeIdSchema.default('ask'),
  })
  .refine((request) => request.mode !== 'ask' || request.question.length <= ASK_MAX_LENGTH, {
    message: `questions take up to ${ASK_MAX_LENGTH} characters`,
    path: ['question'],
  })
export type ModeChatRequest = z.infer<typeof ModeChatRequestSchema>
export type ModeChatRequestInput = z.input<typeof ModeChatRequestSchema>
