import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? process.env.DIFF_BASE ?? 'origin/develop'
const SIZE_WARN = 400
const SIZE_JUSTIFY = 1000
const MAX_ANNOTATIONS = 20

const run = (command, args) =>
  spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const git = (args) => {
  const result = run('git', args)
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} falhou`)
  return result.stdout
}

const range = `${base}...HEAD`
const changed = git(['diff', '--name-only', '--diff-filter=d', range]).split('\n').filter(Boolean)
const changedTs = changed.filter((f) => f.endsWith('.ts') && existsSync(f))

const lines = []
const annotations = []
const warn = (file, line, message) => annotations.push({ file, line, message })

const numstat = git(['diff', '--numstat', range, '--', '.', ':(exclude)package-lock.json'])
  .split('\n')
  .filter(Boolean)
  .map((row) => row.split('\t'))
const totalLines = numstat.reduce(
  (sum, [added, removed]) => sum + (Number(added) || 0) + (Number(removed) || 0),
  0,
)
lines.push('## Relatório de qualidade (informativo)', '')
lines.push(
  `### Tamanho do PR`,
  `${totalLines} linhas alteradas em ${numstat.length} arquivos (sem lockfile).`,
)
if (totalLines > SIZE_JUSTIFY) {
  lines.push(`Acima de ${SIZE_JUSTIFY} linhas: justifique no PR por que não dá para dividir.`)
} else if (totalLines > SIZE_WARN) {
  lines.push(`Acima de ${SIZE_WARN} linhas: considere dividir para a revisão ser efetiva.`)
}
lines.push('')

const eslint = changedTs.length ? run('npx', ['eslint', '-f', 'json', ...changedTs]) : null
const sonarWarnings = []
if (eslint?.stdout) {
  for (const file of JSON.parse(eslint.stdout)) {
    for (const message of file.messages) {
      if (message.severity === 1 && message.ruleId?.startsWith('sonarjs/')) {
        const relative = file.filePath.replace(`${process.cwd()}/`, '')
        sonarWarnings.push(`${relative}:${message.line} ${message.ruleId}`)
        warn(relative, message.line, `${message.ruleId}: ${message.message}`)
      }
    }
  }
}
lines.push('### Avisos de qualidade (sonarjs) nos arquivos alterados')
lines.push(sonarWarnings.length ? sonarWarnings.map((w) => `- ${w}`).join('\n') : 'Nenhum.')
lines.push('')

const knip = run('npx', ['knip', '--reporter', 'json', '--no-exit-code'])
const knipFindings = []
if (knip.stdout.trim()) {
  for (const issue of JSON.parse(knip.stdout).issues ?? []) {
    for (const [kind, items] of Object.entries(issue)) {
      if (!Array.isArray(items) || kind === 'owners' || items.length === 0) continue
      for (const item of items) {
        const touched = changed.includes(issue.file)
        knipFindings.push({ text: `${issue.file}: ${kind} ${item.name}`, touched })
        if (touched) warn(issue.file, item.line ?? 1, `knip ${kind}: ${item.name}`)
      }
    }
  }
}
const touchedKnip = knipFindings.filter((f) => f.touched)
lines.push('### Código e dependências sem uso (knip)')
lines.push(
  touchedKnip.length
    ? touchedKnip.map((f) => `- ${f.text}`).join('\n')
    : 'Nada novo nos arquivos alterados.',
)
lines.push(`Total no repositório: ${knipFindings.length}.`, '')

const duplicates = []
if (changedTs.length) {
  const output = mkdtempSync(join(tmpdir(), 'jscpd-'))
  run('npx', [
    'jscpd',
    '--silent',
    '--min-tokens',
    '60',
    '--reporters',
    'json',
    '--output',
    output,
    '--format',
    'typescript',
    'apps',
    'tools',
  ])
  const report = join(output, 'jscpd-report.json')
  if (existsSync(report)) {
    for (const dup of JSON.parse(readFileSync(report, 'utf8')).duplicates ?? []) {
      const a = dup.firstFile.name
      const b = dup.secondFile.name
      if (!changedTs.includes(a) && !changedTs.includes(b)) continue
      duplicates.push(
        `${a}:${dup.firstFile.start} e ${b}:${dup.secondFile.start} (${dup.lines} linhas)`,
      )
      const file = changedTs.includes(a) ? a : b
      warn(
        file,
        changedTs.includes(a) ? dup.firstFile.start : dup.secondFile.start,
        `trecho duplicado (${dup.lines} linhas)`,
      )
    }
  }
}
lines.push('### Duplicação envolvendo arquivos alterados (jscpd)')
lines.push(duplicates.length ? duplicates.map((d) => `- ${d}`).join('\n') : 'Nenhuma.')

const report = lines.join('\n')
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
if (process.env.GITHUB_ACTIONS) {
  for (const a of annotations.slice(0, MAX_ANNOTATIONS)) {
    console.log(`::warning file=${a.file},line=${a.line}::${a.message.replace(/\n/g, ' ')}`)
  }
}
