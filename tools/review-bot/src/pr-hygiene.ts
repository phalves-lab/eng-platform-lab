import { matchesPath } from './catalog.js'

export interface PullRequestFacts {
  title: string
  body: string
  headRef: string
  baseRef: string
  files: string[]
}

export interface HygieneIssue {
  rule: string
  message: string
}

const TITLE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .{3,}$/
const BRANCH = /^(feat|fix|chore|docs|hotfix|refactor|test|ci)\/([A-Z][A-Z0-9]+-\d+)(-[a-z0-9-]+)?$/
const DEPENDENCY_BRANCH = /^dependabot\//
const TASK_LINE = /\*\*(?:Task|Link da Tarefa):\*\*[\s\S]{0,300}?\b([A-Z][A-Z0-9]+-\d+)\b/
const PLACEHOLDER_KEY = 'CHAVE-123'
const REQUIRED_SECTIONS = ['Contexto de negócio', 'O que mudou', 'Como testar']
const MIGRATION_PATHS = ['apps/*/migrations/**']
const ENV_PATHS = ['.env.example', 'apps/*/.env.example']

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const sectionContent = (body: string, title: string): string | null => {
  const match = new RegExp(
    `##\\s+${escapeRegex(title)}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    'i',
  ).exec(body)
  if (!match) return null
  return (match[1] ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^```\w*\s*$/gm, '')
    .replace(/^\s*--.*$/gm, '')
    .trim()
}

const touches = (files: string[], patterns: string[]) =>
  files.some((file) => patterns.some((pattern) => matchesPath(file, pattern)))

const checkFlow = (pr: PullRequestFacts): HygieneIssue | null => {
  if (pr.baseRef !== 'main') return null
  if (pr.headRef === 'develop' || pr.headRef.startsWith('hotfix/')) return null
  return { rule: 'RN-22', message: 'PR para main só sai de develop (release) ou de hotfix/*.' }
}

/**
 * Regras de higiene que o GitHub free não aplica sozinho. Segue o padrão do time: branch com
 * chave da task, link da task no corpo, seções do template preenchidas e SQL ou ENV
 * obrigatórios quando o diff mexe em migração ou em variável de ambiente.
 */
export const checkHygiene = (pr: PullRequestFacts): HygieneIssue[] => {
  const issues: HygieneIssue[] = []

  if (!TITLE.test(pr.title)) {
    issues.push({ rule: 'RN-08', message: 'Título do PR fora do padrão Conventional Commits.' })
  }

  const flow = checkFlow(pr)
  if (flow) issues.push(flow)

  if (DEPENDENCY_BRANCH.test(pr.headRef) || pr.headRef === 'develop') return issues

  const branch = BRANCH.exec(pr.headRef)
  if (!branch) {
    issues.push({
      rule: 'RN-06',
      message: `Branch "${pr.headRef}" fora do padrão tipo/CHAVE-123-slug.`,
    })
  }

  const taskKey = TASK_LINE.exec(pr.body)?.[1]
  if (!taskKey || taskKey === PLACEHOLDER_KEY) {
    issues.push({ rule: 'RN-11', message: 'Linha **Task:** sem a chave da task.' })
  } else if (branch?.[2] && branch[2] !== taskKey) {
    issues.push({
      rule: 'RN-11',
      message: `Task do corpo (${taskKey}) diferente da task da branch (${branch[2]}).`,
    })
  }

  for (const section of REQUIRED_SECTIONS) {
    const content = sectionContent(pr.body, section)
    if (content === null) {
      issues.push({ rule: 'RN-11', message: `Seção "${section}" ausente na descrição do PR.` })
    } else if (content.length < 10) {
      issues.push({ rule: 'RN-11', message: `Seção "${section}" está vazia.` })
    }
  }

  if (touches(pr.files, MIGRATION_PATHS) && !sectionContent(pr.body, 'SQL')) {
    issues.push({
      rule: 'RN-27',
      message: 'O diff altera migração de banco e a seção SQL está vazia.',
    })
  }
  if (touches(pr.files, ENV_PATHS) && !sectionContent(pr.body, 'ENV')) {
    issues.push({
      rule: 'RN-11',
      message: 'O diff altera variáveis de ambiente e a seção ENV está vazia.',
    })
  }
  return issues
}
