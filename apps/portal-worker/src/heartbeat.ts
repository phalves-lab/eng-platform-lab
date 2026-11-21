import { stat, writeFile } from 'node:fs/promises'

export const HEARTBEAT_INTERVAL_MS = 30_000

/** Liveness file for the container healthcheck: the worker rewrites it while its loop is alive. */
export const startHeartbeat = (
  file: string,
  onError: (error: unknown) => void,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  clock: () => Date = () => new Date(),
) => {
  const beat = () => writeFile(file, clock().toISOString()).catch(onError)
  void beat()
  const timer = setInterval(() => void beat(), intervalMs)
  timer.unref()
  return { stop: () => clearInterval(timer) }
}

/** Healthy when the heartbeat file was written within three heartbeat intervals. */
export const isHeartbeatFresh = async (
  file: string,
  now: Date = new Date(),
  intervalMs = HEARTBEAT_INTERVAL_MS,
): Promise<boolean> => {
  try {
    const { mtime } = await stat(file)
    return now.getTime() - mtime.getTime() <= intervalMs * 3
  } catch {
    return false
  }
}
