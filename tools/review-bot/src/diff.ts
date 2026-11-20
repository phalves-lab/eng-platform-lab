import { execFileSync } from 'node:child_process'

export interface DiffContext {
  files: string[]
  patch: string
  truncated: boolean
}

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

export const collectDiff = (
  repoDir: string,
  base: string,
  head: string,
  maxChars: number,
): DiffContext => {
  const range = `${base}...${head}`
  const files = git(repoDir, ['diff', '--name-only', range]).split('\n').filter(Boolean)
  const full = git(repoDir, [
    'diff',
    '--unified=3',
    range,
    '--',
    '.',
    ':(exclude)package-lock.json',
  ])
  return {
    files,
    patch: full.length > maxChars ? `${full.slice(0, maxChars)}\n[diff truncado]` : full,
    truncated: full.length > maxChars,
  }
}
