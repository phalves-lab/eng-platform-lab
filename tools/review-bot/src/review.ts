import { z } from 'zod'
import type { CatalogModule, RiskRule } from './catalog.js'
import type { DocPage, Task } from './sources/types.js'

const findingSchema = z.object({
  layer: z.enum(['correcao', 'padrao']),
  severity: z.enum(['critica', 'alta', 'media', 'baixa']),
  file: z.string(),
  line: z.number().int().nullable(),
  title: z.string(),
  detail: z.string(),
})

export type Finding = z.infer<typeof findingSchema>

export const reviewSchema = z.object({
  businessSummary: z.string(),
  acceptance: z.array(
    z.object({
      criterion: z.string(),
      status: z.enum(['atendido', 'parcial', 'nao_encontrado']),
      evidence: z.string(),
    }),
  ),
  outOfScope: z.array(z.string()),
  findings: z.array(findingSchema),
  missingTests: z.array(z.string()),
  suggestedRiskLabels: z.array(z.string()),
  docsNeedUpdate: z.boolean(),
})

export type Review = z.infer<typeof reviewSchema>

export const verificationSchema = z.object({
  verdict: z.enum(['confirmado', 'refutado', 'incerto']),
  reason: z.string(),
})

export type Verification = z.infer<typeof verificationSchema>

export interface ReviewContext {
  task: Task | null
  taskOrigin: string | null
  taskKey: string | null
  modules: CatalogModule[]
  uncataloged: string[]
  catalogAdded?: string[]
  catalogInvalid?: string[]
  docs: DocPage[]
  riskRules: RiskRule[]
  files: string[]
  patch: string
  agentsGuide: string
  rubric: string
}

const block = (tag: string, content: string) => `<${tag}>\n${content}\n</${tag}>`

const describeTask = (context: ReviewContext): string => {
  if (!context.task) {
    return context.taskKey
      ? `Task ${context.taskKey} não encontrada na fonte de tasks.`
      : 'Nenhuma chave de task encontrada na branch nem no título do PR.'
  }
  const { task } = context
  const criteria = task.acceptanceCriteria.length
    ? task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'Nenhum critério de aceite escrito na task.'
  return [
    `Chave: ${task.key}`,
    ...(context.taskOrigin === 'pr'
      ? ['Fonte: arquivo do próprio PR, ainda não validado no sistema de tasks.']
      : []),
    `Título: ${task.title}`,
    `Área: ${task.area ?? 'não informada'}`,
    `Tipo de demanda: ${task.demandType ?? 'não informado'}`,
    `Status: ${task.status}`,
    `Épico: ${task.epic ?? 'nenhum'}`,
    `Descrição:\n${task.description}`,
    `Critérios de aceite:\n${criteria}`,
  ].join('\n')
}

const describeModules = (modules: CatalogModule[]): string =>
  modules.length
    ? modules
        .map(
          (m) =>
            `- ${m.name} (${m.tier}): ${m.description}. Dono: ${m.owner}. BUs: ${m.businessUnits.join(', ')}. Quem usa: ${m.users}.`,
        )
        .join('\n')
    : 'Nenhum módulo do catálogo cobre os arquivos alterados.'

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values[key] ?? match)

/**
 * Monta o prompt a partir do template versionado. Todo conteúdo vindo do PR, da task ou
 * da documentação entra em blocos marcados como dados não confiáveis.
 */
export const buildPrompt = (template: string, context: ReviewContext): string =>
  fill(template, {
    RUBRIC: context.rubric,
    AGENTS: block('untrusted_data', context.agentsGuide),
    TASK: block('untrusted_data', describeTask(context)),
    MODULES: block('untrusted_data', describeModules(context.modules)),
    DOCS: block(
      'untrusted_data',
      context.docs.length
        ? context.docs
            .map(
              (d) =>
                `# ${d.title} (atualizada em ${d.updatedAt ?? 'data desconhecida'})\n${d.text.slice(0, 6000)}`,
            )
            .join('\n\n')
        : 'Nenhuma documentação vinculada.',
    ),
    RISK_LABELS:
      context.riskRules.map((r) => `${r.label}: ${r.description}`).join('\n') || 'nenhum',
    FILES: context.files.join('\n'),
    DIFF: block('untrusted_data', context.patch),
  })

export interface VerificationEvidence {
  files: Record<string, string>
  checks: { name: string; conclusion: string }[]
}

const FILE_BUDGET = 40_000

const describeFiles = (finding: Finding, evidence: VerificationEvidence): string => {
  const ordered = [
    ...Object.keys(evidence.files).filter((path) => path === finding.file),
    ...Object.keys(evidence.files).filter((path) => path !== finding.file),
  ]
  let used = 0
  const parts: string[] = []
  for (const path of ordered) {
    const content = evidence.files[path] ?? ''
    if (used + content.length > FILE_BUDGET) {
      parts.push(`### ${path}\n[omitido por tamanho]`)
      continue
    }
    used += content.length
    parts.push(`### ${path}\n${content}`)
  }
  return parts.length ? parts.join('\n\n') : 'Conteúdo dos arquivos indisponível.'
}

const describeChecks = (evidence: VerificationEvidence): string =>
  evidence.checks.length
    ? evidence.checks.map((c) => `- ${c.name}: ${c.conclusion}`).join('\n')
    : 'Resultado dos checks indisponível.'

const formatFinding = (finding: Finding) =>
  `[${finding.severity}] ${finding.title}\nArquivo: ${finding.file}${finding.line ? `:${finding.line}` : ''}\n${finding.detail}`

export const buildVerificationPrompt = (
  template: string,
  finding: Finding,
  context: ReviewContext,
  evidence: VerificationEvidence = { files: {}, checks: [] },
): string =>
  fill(template, {
    FINDING: block('untrusted_data', formatFinding(finding)),
    TASK: block('untrusted_data', describeTask(context)),
    FILES: block('untrusted_data', describeFiles(finding, evidence)),
    CHECKS: block('untrusted_data', describeChecks(evidence)),
    DIFF: block('untrusted_data', context.patch),
  })

/** Severidades que passam por verificação adversarial antes de aparecer no comentário. */
export const NEEDS_VERIFICATION = new Set<Finding['severity']>(['critica', 'alta'])

const DOWNGRADE: Record<Finding['severity'], Finding['severity']> = {
  critica: 'alta',
  alta: 'media',
  media: 'media',
  baixa: 'baixa',
}

export interface VerifiedReview {
  review: Review
  refuted: Finding[]
  uncertain: Finding[]
}

/**
 * Separa os achados graves pelo veredito da verificação. Confirmado fica; refutado sai;
 * incerto (sem evidência no código, nos testes ou nos checks) desce um nível e vai para a
 * lista "a confirmar", fora do cálculo do sinal. Achados médios e baixos passam direto.
 */
export const applyVerification = async (
  review: Review,
  verify: (finding: Finding) => Promise<Verification>,
): Promise<VerifiedReview> => {
  const results = await Promise.all(
    review.findings.map(async (finding) => ({
      finding,
      verdict: NEEDS_VERIFICATION.has(finding.severity) ? (await verify(finding)).verdict : null,
    })),
  )
  return {
    review: {
      ...review,
      findings: results
        .filter((r) => r.verdict === null || r.verdict === 'confirmado')
        .map((r) => r.finding),
    },
    refuted: results.filter((r) => r.verdict === 'refutado').map((r) => r.finding),
    uncertain: results
      .filter((r) => r.verdict === 'incerto')
      .map((r) => ({ ...r.finding, severity: DOWNGRADE[r.finding.severity] })),
  }
}

export type Signal = 'ajustes' | 'gate' | 'pronto'

/**
 * Sinal para o revisor humano, calculado de forma determinística a partir do review já
 * verificado. Não é aprovação: só ordena a fila de quem revisa.
 */
export const computeSignal = (review: Review, context: ReviewContext): Signal => {
  const blockingFinding = review.findings.some((f) => NEEDS_VERIFICATION.has(f.severity))
  const missingCriterion = review.acceptance.some((a) => a.status === 'nao_encontrado')
  const partialCriterion = review.acceptance.some((a) => a.status === 'parcial')
  if (blockingFinding || missingCriterion) return 'ajustes'
  const catalogPending = context.uncataloged.length > 0 || (context.catalogInvalid?.length ?? 0) > 0
  if (partialCriterion || review.docsNeedUpdate || catalogPending) return 'gate'
  return 'pronto'
}

const SIGNAL_TEXT: Record<Signal, string> = {
  ajustes: 'Ajustes recomendados antes da revisão humana',
  gate: 'Pendências antes do merge (critério parcial, documentação ou catálogo)',
  pronto: 'Pronto para revisão humana',
}

const SEVERITY_ORDER = { critica: 0, alta: 1, media: 2, baixa: 3 } as const
const STATUS_TEXT = {
  atendido: 'Atendido',
  parcial: 'Parcial',
  nao_encontrado: 'Não encontrado',
} as const

export const COMMENT_MARKER = '<!-- eng-platform-lab:ai-review -->'

const findingsTable = (findings: Finding[]): string[] => {
  if (!findings.length) return ['Nenhum achado.']
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
  return [
    '| Severidade | Onde | Achado |',
    '|---|---|---|',
    ...sorted.map(
      (f) =>
        `| ${f.severity} | \`${f.file}${f.line ? `:${f.line}` : ''}\` | **${f.title}.** ${f.detail} |`,
    ),
  ]
}

export const renderComment = (
  review: Review,
  context: ReviewContext,
  meta: { model: string; promptVersion: string; refuted: number; uncertain: Finding[] },
): string => {
  const signal = computeSignal(review, context)
  const lines: string[] = [
    COMMENT_MARKER,
    '## Review com contexto',
    '',
    `**Sinal:** ${SIGNAL_TEXT[signal]}`,
  ]

  lines.push(
    context.task
      ? `**Task:** ${context.task.url ? `[${context.task.key}](${context.task.url})` : context.task.key}, ${context.task.title}${context.taskOrigin === 'pr' ? ' (lida do próprio PR)' : ''}`
      : `**Task:** ${context.taskKey ?? 'não identificada'} (sem contexto da task)`,
  )
  if (context.modules.length) {
    lines.push(
      `**Módulos:** ${context.modules.map((m) => `${m.name} (${m.tier}, dono ${m.owner})`).join('; ')}`,
    )
  }
  if (context.riskRules.length) {
    lines.push(`**Risco por caminho:** ${context.riskRules.map((r) => `\`${r.label}\``).join(' ')}`)
  }
  lines.push('', '### Para que serve e impacto', review.businessSummary, '')

  lines.push('### Aderência à task')
  if (review.acceptance.length) {
    lines.push('| Critério | Situação | Evidência |', '|---|---|---|')
    for (const item of review.acceptance) {
      lines.push(`| ${item.criterion} | ${STATUS_TEXT[item.status]} | ${item.evidence} |`)
    }
  } else {
    lines.push(
      'A task não tem critérios de aceite escritos. Pela regra RN-05, ela não deveria estar em desenvolvimento.',
    )
  }
  if (review.outOfScope.length) {
    lines.push('', '**Fora do escopo da task:**', ...review.outOfScope.map((s) => `- ${s}`))
  }
  lines.push('')

  lines.push('### Camada 1: correção')
  lines.push(...findingsTable(review.findings.filter((f) => f.layer === 'correcao')))
  if (review.missingTests.length) {
    lines.push('', '**Testes faltando:**', ...review.missingTests.map((t) => `- ${t}`))
  }
  lines.push('')

  lines.push('### Camada 2: padrão do repositório')
  lines.push(...findingsTable(review.findings.filter((f) => f.layer === 'padrao')))
  lines.push('')

  if (meta.uncertain.length) {
    lines.push('### A confirmar pelo revisor')
    lines.push(
      'A verificação não achou evidência que comprove nem que refute estes pontos; a severidade foi reduzida em um nível e eles não entram no sinal.',
    )
    lines.push(...findingsTable(meta.uncertain), '')
  }

  lines.push('### Camada 3: gates')
  lines.push(
    review.docsNeedUpdate
      ? '- Documentação: o comportamento mudou; a página do módulo precisa refletir a mudança antes do merge.'
      : '- Documentação: sem mudança de comportamento que exija atualização.',
  )
  lines.push(
    context.uncataloged.length
      ? `- Catálogo: arquivos fora de qualquer módulo cadastrado (${context.uncataloged.map((f) => `\`${f}\``).join(', ')}). Módulo novo exige cadastro em \`catalog/modules/\`.`
      : '- Catálogo: todos os arquivos alterados pertencem a módulos cadastrados.',
  )
  if (context.catalogAdded?.length) {
    lines.push(
      `- Catálogo: módulo cadastrado neste PR (${context.catalogAdded.map((m) => `\`${m}\``).join(', ')}); o revisor confere dono, tier e caminhos.`,
    )
  }
  if (context.catalogInvalid?.length) {
    lines.push(
      `- Catálogo: cadastro inválido no PR (${context.catalogInvalid.map((f) => `\`catalog/modules/${f}\``).join(', ')}); corrigir o arquivo para o módulo valer.`,
    )
  }
  const extraLabels = review.suggestedRiskLabels.filter(
    (l) => !context.riskRules.some((r) => r.label === l),
  )
  if (extraLabels.length) {
    lines.push(
      `- Rótulos sugeridos pela IA (exigem confirmação humana): ${extraLabels.map((l) => `\`${l}\``).join(' ')}`,
    )
  }
  lines.push('')

  lines.push(
    '---',
    `Gerado por IA (${meta.model}, prompt ${meta.promptVersion}). Verificação adversarial: ${meta.refuted} achado(s) grave(s) descartado(s) e ${meta.uncertain.length} rebaixado(s) para confirmação. Este comentário não aprova nem bloqueia o PR; quem responde pelo código é o autor e quem aprova é o revisor.`,
  )
  return lines.join('\n')
}
