import { describe, expect, it, vi } from 'vitest'
import { createChatRetentionCollector } from '../src/collectors/chat-retention.js'
import { createLogger } from '../src/logger.js'

describe('chat-retention collector', () => {
  it('deletes conversations idle for longer than the retention and logs the count', async () => {
    const removeInactiveSince = vi.fn(() => Promise.resolve(3))
    const lines: string[] = []
    const collector = createChatRetentionCollector({
      conversations: { removeInactiveSince },
      retentionDays: 90,
      intervalMs: 60_000,
    })
    await collector.run({
      now: new Date('2026-11-21T12:00:00.000Z'),
      logger: createLogger((line) => lines.push(line)),
    })

    expect(collector).toMatchObject({ name: 'chat-retention', schedule: { intervalMs: 60_000 } })
    expect(removeInactiveSince).toHaveBeenCalledWith('2026-08-23T12:00:00.000Z')
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      msg: 'chat.retention',
      removed: 3,
      retentionDays: 90,
    })
  })
})
