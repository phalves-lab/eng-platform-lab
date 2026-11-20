export interface PullRequestFacts {
  title: string
  body: string
  headRef: string
}

export interface HygieneIssue {
  rule: string
  message: string
}

const TITLE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .{3,}$/
const BRANCH = /^(feat|fix|chore|docs|hotfix|refactor|test|ci)\/[A-Z][A-Z0-9]+-\d+(-[a-z0-9-]+)?$/
const DEPENDENCY_BRANCH = /^dependabot\//
const REQUIRED_SECTIONS = ['Contexto de negócio', 'O que mudou', 'Como testar']

const sectionContent = (body: string, title: string): string | null => {
  const match = new RegExp(`##\\s+${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i').exec(body)
  if (!match) return null
  return (match[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim()
}

/** Regras de higiene que o GitHub free não aplica sozinho: título, nome de branch, task e template. */
export const checkHygiene = (pr: PullRequestFacts): HygieneIssue[] => {
  const issues: HygieneIssue[] = []
  const isDependency = DEPENDENCY_BRANCH.test(pr.headRef)

  if (!TITLE.test(pr.title)) {
    issues.push({ rule: 'RN-08', message: 'Título do PR fora do padrão Conventional Commits.' })
  }
  if (isDependency) return issues

  if (!BRANCH.test(pr.headRef)) {
    issues.push({
      rule: 'RN-06',
      message: `Branch "${pr.headRef}" fora do padrão tipo/CHAVE-123-slug.`,
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
  return issues
}
