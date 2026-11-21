import { z } from 'zod'
import {
  type Handbook,
  type PendingDecision,
  type Standard,
  type SystemCard,
  filterStandards,
  filterSystems,
  findStandard,
  findSystem,
  lookupTerm,
  search,
} from './handbook.js'

export type CitationKind = 'standard' | 'system' | 'term' | 'passage'

export interface Citation {
  kind: CitationKind
  /** Standard ID, system slug, glossary term or section source, depending on the kind. */
  ref: string
  label: string
  source: string
}

export interface ToolResult {
  text: string
  citations: Citation[]
}

export interface HandbookTool {
  name: string
  title: string
  description: string
  input: z.ZodObject
  /** Validates raw arguments against `input` and runs the tool; throws on invalid arguments. */
  execute(handbook: Handbook, args: unknown): ToolResult
}

const MAX_CITATIONS = 10
const RULES_SOURCE = 'seção "Para IA" dos padrões'
const STANDARD_IN_SOURCE = /^([A-Z]{1,12}(?:-[A-Z]{1,12})?-\d{1,4}) ·/

const withSource = (body: string, source: string) => `${body}\n\nFonte: ${source}`

const notFound = (what: string, hint: string) => `${what} não encontrado. ${hint}`

const citationKey = (citation: Citation) => `${citation.kind}:${citation.ref}`

/** Removes repeated citations, keeping the first occurrence of each kind and reference. */
export const uniqueCitations = (citations: Citation[]) => {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = citationKey(citation)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const result = (text: string, citations: Citation[] = []): ToolResult => ({
  text,
  citations: uniqueCitations(citations).slice(0, MAX_CITATIONS),
})

const citeStandard = (standard: Standard): Citation => ({
  kind: 'standard',
  ref: standard.id,
  label: `${standard.id} · ${standard.title}`,
  source: standard.source,
})

const citeSystem = (system: SystemCard): Citation => ({
  kind: 'system',
  ref: system.slug,
  label: system.name,
  source: system.source,
})

/** Section title, or the whole trail without file prefixes when the title alone says little. */
const passageLabel = (source: string) => {
  const parts = source.split(' › ')
  const title = parts.at(-1) ?? source
  if (title.length >= 4) return title
  return parts.map((part) => part.replace(/^\d+-/, '').replace(/\.md$/, '')).join(' › ')
}

const citePassage = (handbook: Handbook, source: string): Citation => {
  const id = STANDARD_IN_SOURCE.exec(source.split(' › ').at(-1) ?? '')?.[1]
  const standard = id ? findStandard(handbook, id) : null
  if (standard) return citeStandard(standard)
  return { kind: 'passage', ref: source, label: passageLabel(source), source }
}

const citeDecision = (handbook: Handbook, decision: PendingDecision): Citation => {
  const standard = findStandard(handbook, decision.id)
  if (standard) return citeStandard(standard)
  return {
    kind: 'passage',
    ref: decision.source,
    label: `${decision.id} · ${decision.topic}`,
    source: decision.source,
  }
}

const defineTool = <S extends z.ZodObject>(tool: {
  name: string
  title: string
  description: string
  input: S
  run: (handbook: Handbook, input: z.infer<S>) => ToolResult
}): HandbookTool => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  input: tool.input,
  execute: (handbook, args) => tool.run(handbook, tool.input.parse(args ?? {})),
})

const STATUS = z.enum(['VIGENTE', 'CONFLITO', 'PROPOSTO', 'LACUNA'])

/**
 * Read-only tools over the handbook, shared by the MCP server and the portal chat. Every
 * result carries the text the agent reads and the citations the reader can follow.
 */
export const handbookTools: readonly HandbookTool[] = [
  defineTool({
    name: 'regras_para_ia',
    title: 'Regras para IA',
    description:
      'Regras curtas e vigentes que um agente de código deve seguir sempre nos repositórios do time. Chame no começo de qualquer tarefa de código.',
    input: z.object({}),
    run: (handbook) =>
      handbook.rulesForAi
        ? result(withSource(handbook.rulesForAi, RULES_SOURCE), [
            { kind: 'passage', ref: RULES_SOURCE, label: 'Para IA', source: RULES_SOURCE },
          ])
        : result('O handbook não tem a seção "Para IA".'),
  }),
  defineTool({
    name: 'padrao',
    title: 'Padrão por ID',
    description:
      'Texto completo de um padrão do time pelo ID (ex.: ENG-GIT-02), com status, motivo e fonte.',
    input: z.object({ id: z.string().min(3).describe('ID do padrão, como ENG-PR-03') }),
    run: (handbook, { id }) => {
      const standard = findStandard(handbook, id)
      if (!standard)
        return result(notFound(`Padrão ${id}`, 'Use buscar_padroes para listar os IDs.'))
      return result(withSource(standard.text, standard.source), [citeStandard(standard)])
    },
  }),
  defineTool({
    name: 'buscar_padroes',
    title: 'Buscar padrões',
    description:
      'Lista padrões por termo, área (ex.: ENG-GIT, DADOS, TAG) ou status. Devolve ID, título e status; use padrao para o texto completo.',
    input: z.object({
      termo: z.string().optional().describe('Palavra ou trecho a procurar no padrão'),
      area: z.string().optional().describe('Prefixo do ID ou nome da área'),
      status: STATUS.optional().describe('Filtra pelo status do padrão'),
    }),
    run: (handbook, { termo, area, status }) => {
      const found = filterStandards(handbook, { term: termo, area, status })
      if (!found.length) return result('Nenhum padrão com esses filtros.')
      return result(
        found.map((s) => `${s.id} · ${s.title} [${s.status}]`).join('\n'),
        found.map(citeStandard),
      )
    },
  }),
  defineTool({
    name: 'sistema',
    title: 'Ficha de sistema',
    description:
      'Ficha de um sistema ou serviço: o que é, dono, stack, ambientes, integrações, status, riscos e fontes.',
    input: z.object({ nome: z.string().min(2).describe('Nome ou parte do nome do sistema') }),
    run: (handbook, { nome }) => {
      const system = findSystem(handbook, nome)
      if (!system)
        return result(notFound(`Sistema "${nome}"`, 'Use buscar_sistemas para ver os nomes.'))
      return result(withSource(`Camada: ${system.layer}\n${system.text}`, system.source), [
        citeSystem(system),
      ])
    },
  }),
  defineTool({
    name: 'buscar_sistemas',
    title: 'Buscar sistemas',
    description:
      'Lista sistemas que citam o termo (ou todos), com camada, status e uma linha do que são.',
    input: z.object({
      termo: z.string().optional().describe('Tecnologia, integração ou palavra-chave'),
    }),
    run: (handbook, { termo }) => {
      const found = filterSystems(handbook, termo)
      if (!found.length) return result('Nenhum sistema cita esse termo.')
      return result(
        found
          .map(
            (s) =>
              `${s.name} [${s.layer}] ${s.fields['Status'] ?? ''}\n  ${s.fields['O que é'] ?? ''}`,
          )
          .join('\n'),
        found.map(citeSystem),
      )
    },
  }),
  defineTool({
    name: 'glossario',
    title: 'Glossário',
    description: 'Definição de um termo de negócio, métrica, sigla ou marca usado pelo time.',
    input: z.object({
      termo: z.string().min(2).describe('Termo ou sigla, como PMA ou régua'),
    }),
    run: (handbook, { termo }) => {
      const entries = lookupTerm(handbook, termo)
      if (!entries.length)
        return result(notFound(`Termo "${termo}"`, 'Tente buscar para procurar no handbook todo.'))
      return result(
        entries.map((e) => withSource(`${e.term}: ${e.definition}`, e.source)).join('\n\n'),
        entries.map((e) => ({ kind: 'term', ref: e.term, label: e.term, source: e.source })),
      )
    },
  }),
  defineTool({
    name: 'decisoes_pendentes',
    title: 'Decisões pendentes',
    description:
      'Conflitos e lacunas dos padrões que o time ainda precisa decidir, por prioridade (1 é a mais alta).',
    input: z.object({
      prioridade: z.number().int().min(1).max(3).optional().describe('1, 2 ou 3'),
    }),
    run: (handbook, { prioridade }) => {
      const found = handbook.decisions.filter((d) => !prioridade || d.priority === prioridade)
      if (!found.length) return result('Nenhuma decisão pendente com esse filtro.')
      return result(
        found
          .map((d) => `P${d.priority} ${d.id} · ${d.topic} (${d.kind})\n  ${d.question}`)
          .join('\n'),
        found.map((d) => citeDecision(handbook, d)),
      )
    },
  }),
  defineTool({
    name: 'buscar',
    title: 'Buscar no handbook',
    description:
      'Busca livre em todo o handbook (padrões, sistemas, glossário, times e fluxos). Devolve trechos com a fonte.',
    input: z.object({
      consulta: z.string().min(3).describe('Pergunta ou palavras-chave'),
      limite: z.number().int().min(1).max(20).optional().describe('Quantos trechos devolver'),
    }),
    run: (handbook, { consulta, limite }) => {
      const hits = search(handbook, consulta, limite ?? 8)
      if (!hits.length) return result('Nada encontrado no handbook para essa consulta.')
      return result(
        hits.map((h) => `[${h.source}]\n${h.snippet}`).join('\n\n'),
        hits.map((h) => citePassage(handbook, h.source)),
      )
    },
  }),
]

export const findTool = (name: string) => handbookTools.find((tool) => tool.name === name) ?? null
