import { isIPv4, isIPv6 } from 'node:net'

const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i

const expandV6 = (ip: string): string[] | null => {
  const [head = '', tail, extra] = ip.split('::')
  if (extra !== undefined) return null
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail === undefined) return missing === 0 ? left : null
  return [...left, ...Array<string>(missing).fill('0'), ...right]
}

/**
 * Keeps only the network part of a client address, so the trail can tell networks apart without
 * storing a personal address: IPv4 keeps /24 and IPv6 keeps /48.
 */
export const truncateIp = (ip: string | undefined | null): string | null => {
  if (!ip) return null
  const address = ip.trim().replace(/%.*$/, '')
  const mapped = MAPPED_V4.exec(address)?.[1]
  if (mapped) return truncateIp(mapped)
  if (isIPv4(address)) return `${address.split('.').slice(0, 3).join('.')}.0`
  if (!isIPv6(address)) return null
  const groups = expandV6(address.toLowerCase())
  if (!groups) return null
  return `${groups
    .slice(0, 3)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::`
}
