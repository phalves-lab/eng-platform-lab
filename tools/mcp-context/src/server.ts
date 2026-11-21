import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  type Handbook,
  type StandardStatus,
  filterStandards,
  filterSystems,
  findStandard,
  findSystem,
  lookupTerm,
  search,
} from '@lab/handbook'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })

const withSource = (body: string, source: string) => `${body}\n\nFonte: ${source}`

const notFound = (what: string, hint: string) => text(`${what} não encontrado. ${hint}`)

const STATUS = z.enum(['VIGENTE', 'CONFLITO', 'PROPOSTO', 'LACUNA'])

/**
 * Read-only MCP server over the handbook. Every answer cites the file and section it came
 * from so the agent and the reader can check the source.
 */
export const createServer = (handbook: Handbook) => {
  const server = new McpServer({ name: 'martech-context', version: '0.1.0' })

  server.registerTool(
    'regras_para_ia',
    {
      title: 'Regras para IA',
      description:
        'Regras curtas e vigentes que um agente de código deve seguir sempre nos repositórios do time. Chame no começo de qualquer tarefa de código.',
      annotations: READ_ONLY,
    },
    async () =>
      handbook.rulesForAi
        ? text(withSource(handbook.rulesForAi, 'seção "Para IA" dos padrões'))
        : text('O handbook não tem a seção "Para IA".'),
  )

  server.registerTool(
    'padrao',
    {
      title: 'Padrão por ID',
      description:
        'Texto completo de um padrão do time pelo ID (ex.: ENG-GIT-02), com status, motivo e fonte.',
      inputSchema: { id: z.string().min(3).describe('ID do padrão, como ENG-PR-03') },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const standard = findStandard(handbook, id)
      if (!standard) return notFound(`Padrão ${id}`, 'Use buscar_padroes para listar os IDs.')
      return text(withSource(standard.text, standard.source))
    },
  )

  server.registerTool(
    'buscar_padroes',
    {
      title: 'Buscar padrões',
      description:
        'Lista padrões por termo, área (ex.: ENG-GIT, DADOS, TAG) ou status. Devolve ID, título e status; use padrao para o texto completo.',
      inputSchema: {
        termo: z.string().optional().describe('Palavra ou trecho a procurar no padrão'),
        area: z.string().optional().describe('Prefixo do ID ou nome da área'),
        status: STATUS.optional().describe('Filtra pelo status do padrão'),
      },
      annotations: READ_ONLY,
    },
    async ({ termo, area, status }) => {
      const found = filterStandards(handbook, {
        term: termo,
        area,
        status: status as StandardStatus | undefined,
      })
      if (!found.length) return text('Nenhum padrão com esses filtros.')
      return text(found.map((s) => `${s.id} · ${s.title} [${s.status}]`).join('\n'))
    },
  )

  server.registerTool(
    'sistema',
    {
      title: 'Ficha de sistema',
      description:
        'Ficha de um sistema ou serviço: o que é, dono, stack, ambientes, integrações, status, riscos e fontes.',
      inputSchema: { nome: z.string().min(2).describe('Nome ou parte do nome do sistema') },
      annotations: READ_ONLY,
    },
    async ({ nome }) => {
      const system = findSystem(handbook, nome)
      if (!system) return notFound(`Sistema "${nome}"`, 'Use buscar_sistemas para ver os nomes.')
      return text(withSource(`Camada: ${system.layer}\n${system.text}`, system.source))
    },
  )

  server.registerTool(
    'buscar_sistemas',
    {
      title: 'Buscar sistemas',
      description:
        'Lista sistemas que citam o termo (ou todos), com camada, status e uma linha do que são.',
      inputSchema: {
        termo: z.string().optional().describe('Tecnologia, integração ou palavra-chave'),
      },
      annotations: READ_ONLY,
    },
    async ({ termo }) => {
      const found = filterSystems(handbook, termo)
      if (!found.length) return text('Nenhum sistema cita esse termo.')
      return text(
        found
          .map(
            (s) =>
              `${s.name} [${s.layer}] ${s.fields['Status'] ?? ''}\n  ${s.fields['O que é'] ?? ''}`,
          )
          .join('\n'),
      )
    },
  )

  server.registerTool(
    'glossario',
    {
      title: 'Glossário',
      description: 'Definição de um termo de negócio, métrica, sigla ou marca usado pelo time.',
      inputSchema: { termo: z.string().min(2).describe('Termo ou sigla, como PMA ou régua') },
      annotations: READ_ONLY,
    },
    async ({ termo }) => {
      const entries = lookupTerm(handbook, termo)
      if (!entries.length)
        return notFound(`Termo "${termo}"`, 'Tente buscar para procurar no handbook todo.')
      return text(
        entries.map((e) => withSource(`${e.term}: ${e.definition}`, e.source)).join('\n\n'),
      )
    },
  )

  server.registerTool(
    'decisoes_pendentes',
    {
      title: 'Decisões pendentes',
      description:
        'Conflitos e lacunas dos padrões que o time ainda precisa decidir, por prioridade (1 é a mais alta).',
      inputSchema: {
        prioridade: z.number().int().min(1).max(3).optional().describe('1, 2 ou 3'),
      },
      annotations: READ_ONLY,
    },
    async ({ prioridade }) => {
      const found = handbook.decisions.filter((d) => !prioridade || d.priority === prioridade)
      if (!found.length) return text('Nenhuma decisão pendente com esse filtro.')
      return text(
        found
          .map((d) => `P${d.priority} ${d.id} · ${d.topic} (${d.kind})\n  ${d.question}`)
          .join('\n'),
      )
    },
  )

  server.registerTool(
    'buscar',
    {
      title: 'Buscar no handbook',
      description:
        'Busca livre em todo o handbook (padrões, sistemas, glossário, times e fluxos). Devolve trechos com a fonte.',
      inputSchema: {
        consulta: z.string().min(3).describe('Pergunta ou palavras-chave'),
        limite: z.number().int().min(1).max(20).optional().describe('Quantos trechos devolver'),
      },
      annotations: READ_ONLY,
    },
    async ({ consulta, limite }) => {
      const hits = search(handbook, consulta, limite ?? 8)
      if (!hits.length) return text('Nada encontrado no handbook para essa consulta.')
      return text(hits.map((h) => `[${h.source}]\n${h.snippet}`).join('\n\n'))
    },
  )

  return server
}
