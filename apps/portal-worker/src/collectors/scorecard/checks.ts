import {
  type AlertSeverity,
  type CheckStatus,
  type RepoCatalogEntry,
  type RepoScorecard,
  SCORECARD_CHECK_IDS,
  type ScorecardCheck,
  type ScorecardCheckId,
  type ScorecardPolicy,
  type ScoreLevel,
} from '@lab/contracts'
import type { AlertCounts, BranchFacts, RepoFacts } from './facts.js'

interface Outcome {
  score: number | null
  detail: string
}

interface Definition {
  title: string
  fix: string
  evaluate: (facts: RepoFacts, context: EvaluationContext) => Outcome
}

interface EvaluationContext {
  entry: RepoCatalogEntry
  policy: ScorecardPolicy
  now: Date
}

const DAY_MS = 86_400_000
const UNKNOWN_FIX =
  'Dê ao token do coletor leitura de administração e de segurança do repositório e rode de novo.'
const SEVERITIES: AlertSeverity[] = ['critical', 'high', 'medium', 'low']
const SEVERITY_LABEL: Record<AlertSeverity, [string, string]> = {
  critical: ['crítico', 'críticos'],
  high: ['alto', 'altos'],
  medium: ['médio', 'médios'],
  low: ['baixo', 'baixos'],
}

const unknown = (detail: string): Outcome => ({ score: null, detail })
const binary = (passed: boolean, detail: string): Outcome => ({ score: passed ? 100 : 0, detail })
const ratio = (passed: number, total: number) => Math.round((passed / total) * 100)
const list = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items.at(-1)}` : (items[0] ?? '')

const fileName = (path: string) => path.split('/').at(-1) ?? path

const protectedBranches = (facts: RepoFacts, entry: RepoCatalogEntry) =>
  [...new Set([facts.defaultBranch, entry.integrationBranch])].map(
    (name): BranchFacts =>
      facts.branches.find((branch) => branch.name === name) ?? {
        name,
        exists: false,
        protection: 'none',
        requiresPullRequest: false,
        blocksForcePush: false,
        blocksDeletion: false,
        mergeQueue: false,
      },
  )

const branchGaps = (branch: BranchFacts) =>
  [
    branch.requiresPullRequest ? null : 'aceita push direto',
    branch.blocksForcePush ? null : 'aceita force push',
    branch.blocksDeletion ? null : 'pode ser apagada',
  ].filter((gap): gap is string => gap !== null)

const evaluateBranches = (facts: RepoFacts, { entry }: EvaluationContext): Outcome => {
  const branches = protectedBranches(facts, entry)
  const unreadable = branches.filter(
    (branch) => branch.protection === 'unknown' && branchGaps(branch).length > 0,
  )
  if (unreadable.length) {
    return unknown(
      `Sem permissão para ler a proteção clássica de ${list(unreadable.map((b) => b.name))}.`,
    )
  }
  let passed = 0
  const notes = branches.map((branch) => {
    if (!branch.exists) return `${branch.name} não existe`
    const gaps = branchGaps(branch)
    passed += 3 - gaps.length
    return gaps.length ? `${branch.name} ${list(gaps)}` : `${branch.name} protegida`
  })
  return { score: ratio(passed, branches.length * 3), detail: `${notes.join('; ')}.` }
}

const evaluateMergeQueue = (facts: RepoFacts, { entry }: EvaluationContext): Outcome => {
  const [main] = protectedBranches(facts, entry)
  return binary(
    Boolean(main?.mergeQueue),
    main?.mergeQueue
      ? `${facts.defaultBranch} só recebe merge pela fila.`
      : `${facts.defaultBranch} não exige fila de merge.`,
  )
}

/** A job-level `uses:` pointing at a workflow file is a call to a reusable workflow. */
const reusableCall = (content: string) =>
  content
    .split('\n')
    .filter((line) => /^\s+uses:/.test(line))
    .map((line) =>
      line
        .slice(line.indexOf('uses:') + 5)
        .trim()
        .replace(/['"]/g, ''),
    )
    .find((target) => target.includes('.github/workflows/') && /\.ya?ml(@|$)/.test(target))

const evaluateReusableCi = (facts: RepoFacts): Outcome => {
  const calls = facts.workflows.flatMap((workflow) => {
    const target = reusableCall(workflow.content)
    return target ? [`${fileName(workflow.path)} chama ${target}`] : []
  })
  return binary(
    calls.length > 0,
    calls.length ? `${list(calls)}.` : 'Nenhum workflow chama um workflow reutilizável.',
  )
}

const evaluateCoverage = (facts: RepoFacts, { policy }: EvaluationContext): Outcome => {
  const found = facts.workflows.flatMap((workflow) => {
    const content = workflow.content.toLowerCase()
    const marker = policy.coverageMarkers.find((item) => content.includes(item.toLowerCase()))
    return marker ? [`${fileName(workflow.path)} (${marker})`] : []
  })
  return binary(
    found.length > 0,
    found.length
      ? `Cobertura publicada em ${list(found)}.`
      : 'Nenhum workflow publica cobertura de testes.',
  )
}

const evaluateAgents = (facts: RepoFacts, { policy, now }: EvaluationContext): Outcome => {
  if (!facts.agentsMd.present) return binary(false, 'Não há AGENTS.md na raiz.')
  if (!facts.agentsMd.updatedAt) {
    return { score: 50, detail: 'AGENTS.md existe, mas a data do último commit não foi lida.' }
  }
  const days = Math.floor((now.getTime() - new Date(facts.agentsMd.updatedAt).getTime()) / DAY_MS)
  const limit = policy.agentsMaxAgeDays
  return days <= limit
    ? { score: 100, detail: `AGENTS.md atualizado há ${Math.max(days, 0)} dias.` }
    : { score: 50, detail: `AGENTS.md sem commit há ${days} dias (limite de ${limit}).` }
}

const evaluateSecretScanning = (facts: RepoFacts): Outcome => {
  const { secretScanning, pushProtection } = facts.secretScanning
  if (secretScanning === null || pushProtection === null) {
    return unknown('O token não lê a configuração de secret scanning.')
  }
  const off = [
    secretScanning ? null : 'secret scanning',
    pushProtection ? null : 'push protection',
  ].filter((item): item is string => item !== null)
  return {
    score: ratio(2 - off.length, 2),
    detail: off.length ? `Desligado: ${list(off)}.` : 'Secret scanning e push protection ligados.',
  }
}

const NODE_MAJOR = /^v?(\d+)(?:\.\d+){0,2}$/

const evaluateNode = (facts: RepoFacts, { policy }: EvaluationContext): Outcome => {
  const accepted = policy.nodeMajors.join(', ')
  if (facts.nvmrc === null) return binary(false, `Sem .nvmrc; a política aceita ${accepted}.`)
  const version = facts.nvmrc.trim()
  const major = Number(NODE_MAJOR.exec(version)?.[1] ?? Number.NaN)
  if (Number.isNaN(major)) {
    return binary(false, `.nvmrc com "${version}" não fixa uma versão numérica.`)
  }
  return binary(
    policy.nodeMajors.includes(major),
    policy.nodeMajors.includes(major)
      ? `Node ${major}, dentro da política.`
      : `Node ${major} fora da política (aceita ${accepted}).`,
  )
}

const alertOutcome = (alerts: AlertCounts, policy: ScorecardPolicy, label: string): Outcome => {
  const open = SEVERITIES.filter((severity) => alerts[severity] > 0)
  if (!open.length) return { score: 100, detail: `Nenhum alerta aberto de ${label}.` }
  const penalty = SEVERITIES.reduce(
    (sum, severity) => sum + alerts[severity] * policy.alertPenalty[severity],
    0,
  )
  const total = SEVERITIES.reduce((sum, severity) => sum + alerts[severity], 0)
  const parts = open.map((severity) => {
    const [singular, plural] = SEVERITY_LABEL[severity]
    return `${alerts[severity]} ${alerts[severity] === 1 ? singular : plural}`
  })
  return {
    score: Math.max(0, 100 - penalty),
    detail: `${total} ${total === 1 ? 'alerta aberto' : 'alertas abertos'} de ${label}: ${list(parts)}.`,
  }
}

const evaluateDependabot = (facts: RepoFacts, { policy }: EvaluationContext): Outcome =>
  facts.dependabotAlerts
    ? alertOutcome(facts.dependabotAlerts, policy, 'Dependabot')
    : unknown('O token não lê os alertas do Dependabot ou eles estão desligados.')

const evaluateCodeScanning = (facts: RepoFacts, { policy }: EvaluationContext): Outcome => {
  if (!facts.codeScanning) return unknown('O token não lê os alertas de code scanning.')
  if (!facts.codeScanning.enabled) return binary(false, 'Code scanning não está configurado.')
  return alertOutcome(facts.codeScanning.alerts, policy, 'code scanning')
}

const evaluateRelease = (facts: RepoFacts, { policy }: EvaluationContext): Outcome => {
  const hasWorkflow = facts.workflows.some(
    (workflow) => fileName(workflow.path) === policy.releaseWorkflow,
  )
  const missingLabels = policy.releaseLabels.filter((label) => !facts.labels.includes(label))
  const labelShare = policy.releaseLabels.length
    ? (policy.releaseLabels.length - missingLabels.length) / policy.releaseLabels.length
    : 1
  const missing = [
    hasWorkflow ? null : `workflow ${policy.releaseWorkflow}`,
    ...missingLabels.map((label) => `rótulo ${label}`),
  ].filter((item): item is string => item !== null)
  return {
    score: Math.round((hasWorkflow ? 50 : 0) + labelShare * 50),
    detail: missing.length ? `Falta ${list(missing)}.` : 'Workflow de resumo e rótulos presentes.',
  }
}

/** Title, fix guidance and rule of every scorecard check, in display order. */
export const CHECKS: Record<ScorecardCheckId, Definition> = {
  'branch-protection': {
    title: 'Proteção das branches',
    fix: 'Aplique o ruleset de `policy/rulesets/main.json` (regras `deletion`, `non_fast_forward` e `pull_request`) na branch padrão e na de integração, ou ligue a proteção clássica sem force push e sem delete.',
    evaluate: evaluateBranches,
  },
  'merge-queue': {
    title: 'Fila de merge',
    fix: 'Acrescente a regra `merge_queue` ao ruleset da branch padrão, com merge por squash.',
    evaluate: evaluateMergeQueue,
  },
  'reusable-ci': {
    title: 'CI reutilizável',
    fix: 'Troque os passos copiados por um job que chama o workflow reutilizável da esteira com `uses: <dono>/<repo>/.github/workflows/<arquivo>.yml@<ref>`.',
    evaluate: evaluateReusableCi,
  },
  coverage: {
    title: 'Cobertura publicada',
    fix: 'Rode os testes com cobertura no CI e publique o resultado, por exemplo com `npm run diff-coverage` no job de gates.',
    evaluate: evaluateCoverage,
  },
  'agents-md': {
    title: 'AGENTS.md atualizado',
    fix: 'Crie ou revise o `AGENTS.md` na raiz com stack, arquitetura, comandos e o que não fazer; o commit nele reinicia a contagem.',
    evaluate: evaluateAgents,
  },
  'secret-scanning': {
    title: 'Secret scanning e push protection',
    fix: 'Ligue secret scanning e push protection em Settings, Code security.',
    evaluate: evaluateSecretScanning,
  },
  'node-version': {
    title: 'Versão do Node',
    fix: 'Fixe no `.nvmrc` uma das versões aceitas em `catalog/scorecard/policy.yaml` e alinhe `engines` e o CI.',
    evaluate: evaluateNode,
  },
  'dependabot-alerts': {
    title: 'Alertas do Dependabot',
    fix: 'Atualize as dependências dos alertas abertos do Dependabot, começando pelos críticos e altos.',
    evaluate: evaluateDependabot,
  },
  'code-scanning-alerts': {
    title: 'Alertas de code scanning',
    fix: 'Ligue o code scanning (CodeQL ou envio de SARIF) e trate os alertas abertos, começando pelos críticos e altos.',
    evaluate: evaluateCodeScanning,
  },
  'release-flow': {
    title: 'Fluxo de release',
    fix: 'Adicione o workflow `release-summary.yml` da esteira e crie os rótulos `release` e `pre-release-notes`.',
    evaluate: evaluateRelease,
  },
}

const statusOf = (score: number | null): CheckStatus => {
  if (score === null) return 'unknown'
  if (score >= 100) return 'pass'
  return score <= 0 ? 'fail' : 'partial'
}

const fixFor = (status: CheckStatus, definition: Definition) => {
  if (status === 'pass') return null
  return status === 'unknown' ? UNKNOWN_FIX : definition.fix
}

/** Weighted mean of the readable checks; a check the token could not read does not count. */
export const overallScore = (checks: ScorecardCheck[]): number | null => {
  const known = checks.filter((check) => check.score !== null && check.weight > 0)
  const weight = known.reduce((sum, check) => sum + check.weight, 0)
  if (!weight) return null
  return Math.round(
    known.reduce((sum, check) => sum + check.weight * (check.score ?? 0), 0) / weight,
  )
}

export const levelOf = (score: number | null, policy: ScorecardPolicy): ScoreLevel => {
  if (score === null) return 'unknown'
  if (score >= policy.levels.good) return 'good'
  return score >= policy.levels.attention ? 'attention' : 'critical'
}

const repoUrl = (entry: RepoCatalogEntry) =>
  entry.source === 'github' ? `https://github.com/${entry.repo}` : null

const baseScorecard = (entry: RepoCatalogEntry) => ({
  id: entry.id,
  repo: entry.repo,
  name: entry.name,
  team: entry.team,
  description: entry.description ?? null,
  url: repoUrl(entry),
  source: entry.source,
})

/** Runs every check over the facts of one repository and weighs them into a 0 to 100 score. */
export const scoreRepo = (
  entry: RepoCatalogEntry,
  facts: RepoFacts,
  policy: ScorecardPolicy,
  now: Date,
): RepoScorecard => {
  const context: EvaluationContext = { entry, policy, now }
  const checks = SCORECARD_CHECK_IDS.map((id): ScorecardCheck => {
    const definition = CHECKS[id]
    const outcome = definition.evaluate(facts, context)
    const status = statusOf(outcome.score)
    return {
      id,
      title: definition.title,
      weight: policy.checks[id].weight,
      standardId: policy.checks[id].standard,
      status,
      score: outcome.score,
      detail: outcome.detail,
      fix: fixFor(status, definition),
    }
  })
  const score = overallScore(checks)
  return { ...baseScorecard(entry), score, level: levelOf(score, policy), checks, error: null }
}

/** Placeholder for a repository whose facts could not be read, so the table still lists it. */
export const failedRepo = (entry: RepoCatalogEntry, error: string): RepoScorecard => ({
  ...baseScorecard(entry),
  score: null,
  level: 'unknown',
  checks: [],
  error,
})
