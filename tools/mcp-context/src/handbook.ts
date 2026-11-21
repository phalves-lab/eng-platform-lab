import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Section, normalize, parseFields, parseSections, sourceOf } from './markdown.js'

export type StandardStatus = 'VIGENTE' | 'CONFLITO' | 'PROPOSTO' | 'LACUNA' | 'DESCONHECIDO'

interface Standard {
  id: string
  area: string
  title: string
  status: StandardStatus
  fields: Record<string, string>
  text: string
  source: string
}

interface SystemCard {
  name: string
  layer: string
  fields: Record<string, string>
  text: string
  source: string
}

interface GlossaryEntry {
  term: string
  definition: string
  source: string
}

interface PendingDecision {
  id: string
  topic: string
  kind: string
  question: string
  priority: number
  source: string
}

export interface SearchHit {
  source: string
  snippet: string
  score: number
}

export interface Handbook {
  directory: string
  files: string[]
  sections: Section[]
  standards: Standard[]
  systems: SystemCard[]
  glossary: GlossaryEntry[]
  decisions: PendingDecision[]
  rulesForAi: string | null
}

const STANDARD_HEADING = /^([A-Z]+(?:-[A-Z]+)?-\d+)\s*·\s*(.+)$/
const LAYER_HEADING = /^\d+(\.\d+)+\s+/
const GLOSSARY_LINE = /^\*\*(.+?)\*\*:\s*(.+)$/
const STATUSES: StandardStatus[] = ['VIGENTE', 'CONFLITO', 'PROPOSTO', 'LACUNA']

const sectionText = (section: Section) => `### ${section.title}\n${section.body}`

const toStatus = (value: string | undefined): StandardStatus => {
  const found = STATUSES.find((status) => value?.toUpperCase().startsWith(status))
  return found ?? 'DESCONHECIDO'
}

const readStandards = (sections: Section[]): Standard[] =>
  sections.flatMap((section) => {
    const match = STANDARD_HEADING.exec(section.title)
    if (section.level !== 3 || !match?.[1]) return []
    const fields = parseFields(section.body)
    return [
      {
        id: match[1],
        area: section.parents.at(-1) ?? '',
        title: (match[2] ?? '').trim(),
        status: toStatus(fields['Status']),
        fields,
        text: sectionText(section),
        source: sourceOf(section),
      },
    ]
  })

/** Fichas de sistema: títulos de nível 3 com campos, fora dos títulos numerados de camada. */
const readSystems = (sections: Section[]): SystemCard[] => {
  const systems: SystemCard[] = []
  let layer = ''
  for (const section of sections) {
    if (section.level !== 3 || STANDARD_HEADING.test(section.title)) continue
    if (LAYER_HEADING.test(section.title)) {
      layer = section.title.replace(LAYER_HEADING, '')
      continue
    }
    const fields = parseFields(section.body)
    if (!fields['O que é']) continue
    systems.push({
      name: section.title,
      layer,
      fields,
      text: sectionText(section),
      source: sourceOf(section),
    })
  }
  return systems
}

const readGlossary = (sections: Section[]): GlossaryEntry[] =>
  sections.flatMap((section) =>
    section.body.split('\n').flatMap((line) => {
      const match = GLOSSARY_LINE.exec(line.trim())
      if (!match?.[1] || !match[2]) return []
      return [{ term: match[1], definition: match[2].trim(), source: sourceOf(section) }]
    }),
  )

const readDecisions = (sections: Section[]): PendingDecision[] =>
  sections.flatMap((section) => {
    const priority = /^Prioridade (\d+)/.exec(section.title)?.[1]
    if (!priority) return []
    return section.body
      .split('\n')
      .filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line.trim()))
      .flatMap((line) => {
        const [id = '', topic = '', kind = '', question = ''] = line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
        if (!id || id === 'ID') return []
        return [
          { id, topic, kind, question, priority: Number(priority), source: sourceOf(section) },
        ]
      })
  })

/** Carrega todos os `.md` da pasta do handbook e indexa padrões, sistemas, glossário e decisões. */
export const loadHandbook = async (directory: string): Promise<Handbook> => {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md')).sort()
  const sections = (
    await Promise.all(
      files.map(async (file) => parseSections(file, await readFile(join(directory, file), 'utf8'))),
    )
  ).flat()
  const rules = sections.find(
    (section) => section.level === 2 && normalize(section.title) === 'para ia',
  )

  return {
    directory,
    files,
    sections,
    standards: readStandards(sections),
    systems: readSystems(sections),
    glossary: readGlossary(sections),
    decisions: readDecisions(sections),
    rulesForAi: rules ? rules.body : null,
  }
}

export const findStandard = (handbook: Handbook, id: string) =>
  handbook.standards.find((standard) => standard.id.toUpperCase() === id.trim().toUpperCase()) ??
  null

export interface StandardFilter {
  term?: string | undefined
  area?: string | undefined
  status?: StandardStatus | undefined
}

export const filterStandards = (handbook: Handbook, filter: StandardFilter) => {
  const term = filter.term ? normalize(filter.term) : null
  const area = filter.area ? normalize(filter.area) : null
  return handbook.standards.filter(
    (standard) =>
      (!filter.status || standard.status === filter.status) &&
      (!area ||
        normalize(standard.id).startsWith(area) ||
        normalize(standard.area).includes(area)) &&
      (!term || normalize(standard.text).includes(term)),
  )
}

/** Acha a ficha pelo nome exato, depois pelo começo do nome e por fim por trecho do nome. */
export const findSystem = (handbook: Handbook, name: string) => {
  const target = normalize(name)
  const names = handbook.systems.map((system) => normalize(system.name))
  const index =
    names.findIndex((value) => value === target) >= 0
      ? names.findIndex((value) => value === target)
      : names.findIndex((value) => value.startsWith(target)) >= 0
        ? names.findIndex((value) => value.startsWith(target))
        : names.findIndex((value) => value.includes(target))
  return index >= 0 ? (handbook.systems[index] ?? null) : null
}

export const filterSystems = (handbook: Handbook, term?: string) => {
  if (!term) return handbook.systems
  const target = normalize(term)
  return handbook.systems.filter((system) => normalize(system.text).includes(target))
}

export const lookupTerm = (handbook: Handbook, term: string) => {
  const target = normalize(term)
  const exact = handbook.glossary.filter((entry) =>
    normalize(entry.term)
      .split(/[,/]/)
      .map((part) => part.trim())
      .includes(target),
  )
  if (exact.length) return exact
  return handbook.glossary.filter((entry) => normalize(entry.term).includes(target))
}

const snippetAround = (text: string, index: number, radius = 160) => {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  return `${start > 0 ? '...' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '...' : ''}`
}

/** Busca por palavras em todas as seções; pontua por ocorrências e dá peso extra ao título. */
export const search = (handbook: Handbook, query: string, limit = 8): SearchHit[] => {
  const words = normalize(query)
    .split(' ')
    .filter((word) => word.length > 2)
  if (!words.length) return []

  return handbook.sections
    .map((section) => {
      const title = normalize(section.title)
      const body = normalize(section.body)
      let score = 0
      let first = -1
      for (const word of words) {
        if (title.includes(word)) score += 5
        let at = body.indexOf(word)
        if (at >= 0 && (first < 0 || at < first)) first = at
        while (at >= 0) {
          score += 1
          at = body.indexOf(word, at + word.length)
        }
      }
      return { section, score, first }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ section, score, first }) => ({
      source: sourceOf(section),
      snippet: snippetAround(section.body, Math.max(0, first)),
      score,
    }))
}
