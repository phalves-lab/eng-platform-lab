import { z } from 'zod'
import type { CatalogModule, RiskRule } from './catalog.js'
import type { DocPage, Task } from './sources/types.js'

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
  findings: z.array(
    z.object({
      severity: z.enum(['critica', 'alta', 'media', 'baixa']),
      file: z.string(),
      line: z.number().int().nullable(),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  missingTests: z.array(z.string()),
  suggestedRiskLabels: z.array(z.string()),
  docsNeedUpdate: z.boolean(),
})

export type Review = z.infer<typeof reviewSchema>

export interface ReviewContext {
  task: Task | null
  taskKey: string | null
  modules: CatalogModule[]
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
    `Título: ${task.title}`,
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

/**
 * Monta o prompt a partir do template versionado. Todo conteúdo vindo do PR, da task ou
 * da documentação entra em blocos marcados como dados não confiáveis.
 */
export const buildPrompt = (template: string, context: ReviewContext): string => {
  const values: Record<string, string> = {
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
  }
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values[key] ?? match)
}

const SEVERITY_ORDER = { critica: 0, alta: 1, media: 2, baixa: 3 } as const
const STATUS_TEXT = {
  atendido: 'Atendido',
  parcial: 'Parcial',
  nao_encontrado: 'Não encontrado',
} as const

export const COMMENT_MARKER = '<!-- eng-platform-lab:ai-review -->'

export const renderComment = (
  review: Review,
  context: ReviewContext,
  meta: { model: string; promptVersion: string },
): string => {
  const lines: string[] = [COMMENT_MARKER, '## Review com contexto', '']

  const taskLine = context.task
    ? `**Task:** ${context.task.url ? `[${context.task.key}](${context.task.url})` : context.task.key}, ${context.task.title}`
    : `**Task:** ${context.taskKey ?? 'não identificada'} (sem contexto da task)`
  lines.push(taskLine)
  if (context.modules.length) {
    lines.push(
      `**Módulos:** ${context.modules.map((m) => `${m.name} (${m.tier}, dono ${m.owner})`).join('; ')}`,
    )
  }
  if (context.riskRules.length) {
    lines.push(`**Risco por caminho:** ${context.riskRules.map((r) => `\`${r.label}\``).join(' ')}`)
  }
  lines.push('', '### Para que serve e impacto', review.businessSummary, '')

  lines.push('### Critérios de aceite')
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
  lines.push('')

  if (review.outOfScope.length) {
    lines.push('### Fora do escopo da task', ...review.outOfScope.map((s) => `- ${s}`), '')
  }

  const findings = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
  lines.push('### Achados')
  if (findings.length) {
    lines.push('| Severidade | Onde | Achado |', '|---|---|---|')
    for (const f of findings) {
      lines.push(
        `| ${f.severity} | \`${f.file}${f.line ? `:${f.line}` : ''}\` | **${f.title}.** ${f.detail} |`,
      )
    }
  } else {
    lines.push('Nenhum achado.')
  }
  lines.push('')

  if (review.missingTests.length) {
    lines.push('### Testes faltando', ...review.missingTests.map((t) => `- ${t}`), '')
  }

  const extraLabels = review.suggestedRiskLabels.filter(
    (l) => !context.riskRules.some((r) => r.label === l),
  )
  if (extraLabels.length) {
    lines.push(
      `**Rótulos sugeridos pela IA (exigem confirmação humana):** ${extraLabels.map((l) => `\`${l}\``).join(' ')}`,
      '',
    )
  }
  if (review.docsNeedUpdate) {
    lines.push(
      '**Documentação:** o comportamento mudou; confira se a página do módulo foi atualizada.',
      '',
    )
  }

  lines.push(
    '---',
    `Gerado por IA (${meta.model}, prompt ${meta.promptVersion}). Este comentário não aprova nem bloqueia o PR; quem responde pelo código é o autor e quem aprova é o revisor.`,
  )
  return lines.join('\n')
}
