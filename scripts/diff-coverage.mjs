import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const base = process.argv[2] ?? process.env.DIFF_BASE ?? 'origin/main'
const minimum = Number(process.env.DIFF_COVERAGE_MIN ?? 70)
const root = process.cwd()
const workspaces = [
  'apps/api',
  'apps/panel',
  'apps/portal-api',
  'apps/portal-worker',
  'packages/database',
  'packages/dora',
  'packages/flow',
  'packages/llm-usage',
  'packages/telemetry',
  'tools/eng-metrics',
  'tools/mcp-context',
  'tools/review-bot',
]

const covered = new Map()
for (const workspace of workspaces) {
  const lcovPath = join(root, workspace, 'coverage/lcov.info')
  if (!existsSync(lcovPath)) continue
  let current = null
  for (const line of readFileSync(lcovPath, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      current = relative(root, resolve(root, workspace, line.slice(3)))
      covered.set(current, covered.get(current) ?? new Map())
    } else if (line.startsWith('DA:') && current) {
      const [lineNumber, hits] = line.slice(3).split(',').map(Number)
      covered.get(current).set(lineNumber, hits > 0)
    }
  }
}

const diff = execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`, '--', '*.ts'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

let file = null
let total = 0
let hit = 0
const uncovered = []
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) {
    file = line.startsWith('+++ b/') ? line.slice(6) : null
    continue
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
  if (!hunk || !file || !covered.has(file)) continue
  const start = Number(hunk[1])
  const count = hunk[2] === undefined ? 1 : Number(hunk[2])
  const lines = covered.get(file)
  for (let n = start; n < start + count; n += 1) {
    if (!lines.has(n)) continue
    total += 1
    if (lines.get(n)) hit += 1
    else uncovered.push(`${file}:${n}`)
  }
}

if (total === 0) {
  console.log('Diff coverage: nenhuma linha executável alterada em código coberto por testes.')
  process.exit(0)
}

const percent = (hit / total) * 100
console.log(
  `Diff coverage: ${percent.toFixed(1)}% (${hit}/${total} linhas alteradas), mínimo ${minimum}%.`,
)
if (uncovered.length) console.log(`Sem cobertura:\n${uncovered.slice(0, 50).join('\n')}`)
if (percent < minimum) process.exit(1)
