import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/develop' },
    'body-file': { type: 'string' },
  },
})

const base = values.base
const bodyArgs = values['body-file'] ? ['--body-file', resolve(values['body-file'])] : []
const hasBinary = (name) => spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0
const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL)
const cwd = process.cwd()

const steps = [
  { name: 'lint', cmd: ['npm', 'run', 'lint'], blocks: true },
  { name: 'formatação', cmd: ['npm', 'run', 'format'], blocks: true },
  { name: 'tipos', cmd: ['npm', 'run', 'typecheck'], blocks: true },
  { name: 'testes com cobertura', cmd: ['npm', 'run', 'test:coverage'], blocks: true },
  {
    name: 'cobertura das linhas novas',
    cmd: ['npm', 'run', 'diff-coverage', '--', base],
    blocks: true,
  },
  { name: 'build', cmd: ['npm', 'run', 'build'], blocks: true },
  {
    name: 'higiene do PR',
    cmd: [
      'npm',
      'run',
      'review',
      '--',
      'hygiene-local',
      '--base',
      base,
      '--repo-dir',
      cwd,
      ...bodyArgs,
    ],
    blocks: true,
    showOutput: true,
  },
  hasBinary('semgrep')
    ? {
        name: 'semgrep',
        cmd: [
          'semgrep',
          'scan',
          '--config',
          'policy/semgrep',
          '--error',
          '--metrics=off',
          '--quiet',
        ],
        blocks: true,
      }
    : { name: 'semgrep', skip: 'semgrep não instalado localmente; roda no CI', blocks: true },
  {
    name: 'segredos e dependências',
    skip: 'TruffleHog e revisão de dependências rodam no CI',
    blocks: true,
  },
  {
    name: 'relatório de qualidade',
    cmd: ['npm', 'run', 'quality', '--', base],
    blocks: false,
    showOutput: true,
  },
  hasGemini
    ? {
        name: 'review do bot',
        cmd: [
          'npm',
          'run',
          'review',
          '--',
          'review',
          '--repo-dir',
          cwd,
          '--config-dir',
          cwd,
          '--base',
          base,
        ],
        blocks: false,
        showOutput: true,
      }
    : {
        name: 'review do bot',
        skip: 'sem GEMINI_API_KEY e GEMINI_MODEL no ambiente; o bot comenta no PR',
        blocks: false,
      },
]

const results = []
for (const step of steps) {
  if (step.skip) {
    results.push({ ...step, status: 'pulado', detail: step.skip })
    continue
  }
  const started = Date.now()
  process.stdout.write(`> ${step.name}... `)
  const run = spawnSync(step.cmd[0], step.cmd.slice(1), {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const ok = run.status === 0
  console.log(`${ok ? 'ok' : 'falhou'} (${seconds}s)`)
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    .split('\n')
    .filter((line) => !line.startsWith('> ') && line.trim())
  if (!ok || step.showOutput) console.log(output.slice(-40).join('\n'), '\n')
  results.push({ ...step, status: ok ? 'ok' : 'falhou', detail: `${seconds}s` })
}

console.log('\nResumo do pre-pr')
for (const r of results) {
  const role = r.blocks ? 'bloqueia no CI' : 'informa'
  console.log(`  ${r.status.padEnd(7)} ${r.name.padEnd(28)} ${role.padEnd(15)} ${r.detail}`)
}

const blocking = results.filter((r) => r.blocks && r.status === 'falhou')
if (blocking.length) {
  console.log(
    `\n${blocking.length} etapa(s) vão barrar o PR no CI: ${blocking.map((r) => r.name).join(', ')}.`,
  )
  process.exitCode = 1
} else {
  console.log('\nNenhuma etapa local vai barrar o PR. Etapas puladas rodam no CI.')
}
