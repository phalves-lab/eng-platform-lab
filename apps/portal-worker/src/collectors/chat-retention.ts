import type { ConversationRepository } from '@lab/database'
import type { Collector } from '../collector.js'

const DAY_MS = 86_400_000

export interface ChatRetentionOptions {
  conversations: Pick<ConversationRepository, 'removeInactiveSince'>
  retentionDays: number
  intervalMs: number
}

/** Deletes chat conversations with no activity in the last `retentionDays` days. */
export const createChatRetentionCollector = (options: ChatRetentionOptions): Collector => ({
  name: 'chat-retention',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS).toISOString()
    const removed = await options.conversations.removeInactiveSince(cutoff)
    logger.info('chat.retention', { cutoff, removed, retentionDays: options.retentionDays })
  },
})
