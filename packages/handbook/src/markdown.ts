export interface Section {
  file: string
  level: number
  title: string
  /** Titles of the enclosing headings, outermost first. */
  parents: string[]
  body: string
}

const HEADING = /^(#{1,6})\s+(.+?)\s*$/

const stripFrontmatter = (markdown: string) =>
  markdown.startsWith('---\n') ? markdown.slice(markdown.indexOf('\n---', 4) + 4) : markdown

const unquote = (value: string) => {
  const quote = value.at(0)
  return value.length > 1 && (quote === "'" || quote === '"') && value.endsWith(quote)
    ? value.slice(1, -1)
    : value
}

/** Reads the flat `key: value` pairs of a leading frontmatter block; lists and nesting are ignored. */
export const parseFrontmatter = (markdown: string): Record<string, string> => {
  if (!markdown.startsWith('---\n')) return {}
  const end = markdown.indexOf('\n---', 4)
  if (end < 0) return {}
  const fields: Record<string, string> = {}
  for (const line of markdown.slice(4, end).split('\n')) {
    const colon = line.indexOf(':')
    const key = line.slice(0, colon)
    const value = unquote(line.slice(colon + 1).trim())
    if (colon > 0 && /^\w[\w-]*$/.test(key) && value) fields[key] = value
  }
  return fields
}

/** Splits markdown into heading sections, keeping the trail of enclosing headings. */
export const parseSections = (file: string, markdown: string): Section[] => {
  const sections: Section[] = []
  const stack: { level: number; title: string }[] = []
  let current: Section | null = null
  let inCode = false

  for (const line of stripFrontmatter(markdown).split('\n')) {
    if (line.trimStart().startsWith('```')) inCode = !inCode
    const heading = inCode ? null : HEADING.exec(line)
    if (!heading) {
      if (current) current.body += `${line}\n`
      continue
    }
    const level = (heading[1] ?? '').length
    const title = heading[2] ?? ''
    while (stack.length && (stack.at(-1)?.level ?? 0) >= level) stack.pop()
    current = { file, level, title, parents: stack.map((s) => s.title), body: '' }
    sections.push(current)
    stack.push({ level, title })
  }

  return sections.map((section) => ({ ...section, body: section.body.trim() }))
}

const FIELD = /^-\s+\*\*(.+?):\*\*\s*(.*)$/

/** Reads `- **Field:** value` lines from a section body. */
export const parseFields = (body: string): Record<string, string> => {
  const fields: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const match = FIELD.exec(line.trim())
    if (match?.[1]) fields[match[1].trim()] = (match[2] ?? '').trim()
  }
  return fields
}

/** Lowercases, strips accents and collapses whitespace for comparisons. */
export const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const sourceOf = (section: Pick<Section, 'file' | 'parents' | 'title'>) =>
  [section.file, ...section.parents.slice(1), section.title].join(' › ')
