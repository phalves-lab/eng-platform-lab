interface AdfNode {
  type?: string
  text?: string
  content?: AdfNode[]
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'rule'])

export const adfToText = (node: unknown): string => {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  const adf = node as AdfNode
  if (adf.type === 'text') return adf.text ?? ''
  if (adf.type === 'hardBreak') return '\n'
  const inner = (adf.content ?? []).map(adfToText).join('')
  if (adf.type === 'listItem') return `- ${inner.trim()}\n`
  return BLOCK_TYPES.has(adf.type ?? '') ? `${inner}\n` : inner
}

export const storageToText = (html: string): string =>
  html
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const HEADING =
  /^\s*#*\s*(crit[eé]rios? de aceita[cç][aã]o|crit[eé]rios? de aceite|acceptance criteria)\s*:?\s*$/i
const ITEM = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+(.+)$/

/** Extrai os itens listados logo abaixo do título "Critérios de aceite" (ou variações). */
export const extractAcceptanceCriteria = (text: string): string[] => {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => HEADING.test(line))
  if (start === -1) return []

  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) {
      if (items.length > 0) break
      continue
    }
    const match = ITEM.exec(line)
    if (!match?.[1]) break
    items.push(match[1].trim())
  }
  return items
}

export const extractTaskKey = (...candidates: (string | null | undefined)[]): string | null => {
  for (const candidate of candidates) {
    const match = /\b([A-Z][A-Z0-9]+-\d+)\b/.exec(candidate ?? '')
    if (match?.[1]) return match[1]
  }
  return null
}
