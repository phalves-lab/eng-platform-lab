import { ASK_MAX_LENGTH, type ChatModeId, DRAFT_MAX_LENGTH } from '@lab/contracts'
import { HANDBOOK_TOOL_NAMES } from '../tools/chat-tool.js'
import type { PortalToolName } from '../tools/portal-tools.js'

export type DraftModeId = Exclude<ChatModeId, 'ask'>

export interface SkillRef {
  plugin: string
  skill: string
}

export interface ModeDefinition {
  id: ChatModeId
  label: string
  description: string
  placeholder: string
  examples: string[]
  maxLength: number
  /** Marketplace skill whose role the mode plays; its description joins the system prompt. */
  skill: SkillRef | null
  handbookTools: boolean
  portalTools: PortalToolName[]
}

export const MODE_DEFINITIONS: readonly ModeDefinition[] = [
  {
    id: 'ask',
    label: 'Perguntar',
    description:
      'Dúvidas sobre padrões, sistemas, siglas e decisões do handbook, sempre com a fonte.',
    placeholder: 'Pergunte algo, por exemplo: quem é dono do bot de review?',
    examples: [
      'Qual o padrão de nome de branch?',
      'O que diz o ENG-QA-01?',
      'Quantas aprovações um PR precisa?',
      'Como o bot de review funciona?',
    ],
    maxLength: ASK_MAX_LENGTH,
    skill: null,
    handbookTools: true,
    portalTools: [],
  },
  {
    id: 'refine-task',
    label: 'Refinar task',
    description:
      'Critérios de aceite, perguntas em aberto e riscos de uma task, com entrevista de uma pergunta por vez e sempre uma recomendação.',
    placeholder: 'Cole o texto da task ou digite a chave de uma task de exemplo, como LAB-53',
    examples: [
      'Refine a task LAB-53',
      'Refine esta task: permitir reagendar uma campanha já aprovada, sem perder o histórico de aprovação.',
    ],
    maxLength: DRAFT_MAX_LENGTH,
    skill: { plugin: 'lab-grill', skill: 'grill' },
    handbookTools: true,
    portalTools: ['tarefa'],
  },
  {
    id: 'pr-description',
    label: 'Descrição de PR',
    description:
      'Descrição no template de PR do repositório a partir do título, da task e do resumo do diff.',
    placeholder: 'Cole o título do PR, a chave ou o texto da task e o resumo do diff',
    examples: [
      'Título: feat(portal): prévia da release. Task: LAB-51. Diff: rota GET /api/releases/preview, regras puras em rules.ts e tela /releases.',
    ],
    maxLength: DRAFT_MAX_LENGTH,
    skill: { plugin: 'lab-taskforge', skill: 'taskforge' },
    handbookTools: true,
    portalTools: ['tarefa'],
  },
  {
    id: 'release-notes',
    label: 'Nota de release',
    description: 'Nota técnica e nota de negócio a partir da lista de PRs da release.',
    placeholder: 'Cole a lista de PRs: número, título, task e rótulos de cada um',
    examples: [
      '#21 feat(portal): DORA por repositório (LAB-27)\n#22 fix(worker): retry no coletor do Jira (LAB-23)\n#24 feat(api): tabela release_runs (LAB-53) risk:db-migration',
    ],
    maxLength: DRAFT_MAX_LENGTH,
    skill: { plugin: 'lab-changelog', skill: 'release-notes' },
    handbookTools: true,
    portalTools: ['tarefa'],
  },
  {
    id: 'adr',
    label: 'ADR',
    description: 'Registro de decisão no modelo de ADR do handbook, a partir de uma conversa.',
    placeholder: 'Cole a conversa, thread ou ata em que a decisão foi discutida',
    examples: [
      'Dev: o bot de review está caro com o modelo atual. Líder: vamos testar outro modelo no golden set antes. Dev: combinado, se o acerto não cair, trocamos.',
    ],
    maxLength: DRAFT_MAX_LENGTH,
    skill: null,
    handbookTools: true,
    portalTools: [],
  },
  {
    id: 'weekly-summary',
    label: 'Resumo da semana',
    description:
      'Resumo da semana do time com as métricas de review, de fluxo e DORA que o portal já calcula.',
    placeholder: 'Peça o resumo e, se quiser, diga o projeto, o time ou o conjunto de dados',
    examples: ['Resumo da semana do time', 'Resumo da semana do projeto LAB'],
    maxLength: DRAFT_MAX_LENGTH,
    skill: null,
    handbookTools: false,
    portalTools: ['metricas_review', 'metricas_fluxo', 'metricas_dora'],
  },
]

export const DRAFT_MODE_IDS = MODE_DEFINITIONS.flatMap((mode) =>
  mode.id === 'ask' ? [] : [mode.id],
)

export const modeDefinition = (id: ChatModeId): ModeDefinition => {
  const found = MODE_DEFINITIONS.find((mode) => mode.id === id)
  if (!found) throw new Error(`Unknown chat mode ${id}`)
  return found
}

/** Names of the tools the model may call in a mode. */
export const toolNamesOf = (id: ChatModeId): string[] => {
  const definition = modeDefinition(id)
  return [...(definition.handbookTools ? HANDBOOK_TOOL_NAMES : []), ...definition.portalTools]
}
