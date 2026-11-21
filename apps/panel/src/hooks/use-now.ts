import { useEffect, useState } from 'react'

/** Relógio que avança a cada minuto, para textos como "há 5 min" não ficarem parados. */
export const useNow = (intervalMs = 60_000) => {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
