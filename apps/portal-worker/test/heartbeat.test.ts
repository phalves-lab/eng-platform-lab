import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isHeartbeatFresh, startHeartbeat } from '../src/heartbeat.js'

const tempFile = async () => join(await mkdtemp(join(tmpdir(), 'heartbeat-')), 'beat')

describe('heartbeat', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the file right away and again on every interval', async () => {
    const file = await tempFile()
    let now = new Date('2026-11-20T12:00:00.000Z')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const heartbeat = startHeartbeat(
      file,
      () => undefined,
      1_000,
      () => now,
    )
    await vi.waitFor(async () => expect(await readFile(file, 'utf8')).toBe(now.toISOString()))

    now = new Date('2026-11-20T12:00:01.000Z')
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(async () =>
      expect(await readFile(file, 'utf8')).toBe('2026-11-20T12:00:01.000Z'),
    )
    heartbeat.stop()
  })

  it('reports write failures instead of swallowing them', async () => {
    const errors: unknown[] = []
    const heartbeat = startHeartbeat(join(tmpdir(), 'missing-dir', 'x', 'beat'), (error) =>
      errors.push(error),
    )
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    heartbeat.stop()
  })

  it('is fresh only within three intervals and never when the file is missing', async () => {
    const file = await tempFile()
    await writeFile(file, 'now')
    expect(await isHeartbeatFresh(file)).toBe(true)

    const written = new Date('2026-11-20T12:00:00.000Z')
    await utimes(file, written, written)
    expect(await isHeartbeatFresh(file, new Date('2026-11-20T12:01:30.000Z'), 30_000)).toBe(true)
    expect(await isHeartbeatFresh(file, new Date('2026-11-20T12:01:31.000Z'), 30_000)).toBe(false)
    expect(await isHeartbeatFresh(`${file}-missing`)).toBe(false)
  })
})
