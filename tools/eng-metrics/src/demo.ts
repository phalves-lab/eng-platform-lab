import type { BotSignal, ChecksState, Dataset, PullRequest, TaskStatus } from './types.js'

const PEOPLE = ['ana', 'bruno', 'carla', 'diego', 'elisa', 'fabio', 'gabi', 'heitor']
const AREAS = ['Marketing Direto', 'Martech Dados', 'Digital Experience', 'SEO']
const TITLES = [
  'Filtro de campanhas por BU',
  'Exportar relatório de leads',
  'Ajustar regra de aprovação',
  'Novo campo de exclusão de unidades',
  'Histórico de alterações de regra',
  'Corrigir paginação da listagem',
  'Melhorar busca de cursos',
  'Validar formulário de oferta',
  'Integração com envio de WhatsApp',
  'Tela de auditoria do transacional',
]

/** Gerador determinístico (mulberry32) para o exemplo ser igual a cada publicação. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

const HOUR = 3_600_000

/** Time fictício de 8 pessoas, para mostrar o painel com volume parecido com o real. */
export const demoDataset = (now: string): Dataset => {
  const rand = random(42)
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)] as T
  const at = (hoursAgo: number) => new Date(new Date(now).getTime() - hoursAgo * HOUR).toISOString()

  const pullRequests: PullRequest[] = []
  const tasks: TaskStatus[] = []

  for (let i = 0; i < 46; i += 1) {
    const key = `DEMO-${100 + i}`
    const author = pick(PEOPLE)
    const open = i < 9
    const readyHoursAgo = open ? 4 + rand() * 120 : 24 + rand() * 640
    const size = Math.round(40 + rand() * (rand() > 0.85 ? 1400 : 380))
    const reviewers = PEOPLE.filter((p) => p !== author)
    const reviewCount = open ? (rand() > 0.55 ? 1 : 0) : 1 + Math.floor(rand() * 2)
    const reviews = Array.from({ length: reviewCount }, (_, r) => ({
      author: pick(reviewers),
      state: 'APPROVED',
      submittedAt: at(readyHoursAgo - (2 + rand() * 30) - r * 3),
      comments: Math.floor(rand() * 6),
    }))
    const signal: BotSignal = pick(['pronto', 'pronto', 'gate', 'ajustes', null])
    const checks: ChecksState = open && rand() > 0.8 ? 'FAILURE' : 'SUCCESS'
    const title = `${pick(TITLES)} (${pick(AREAS)})`
    pullRequests.push({
      number: 500 + i,
      title: `feat: ${key} ${title}`,
      url: `https://example.invalid/pr/${500 + i}`,
      author,
      state: open ? 'OPEN' : 'MERGED',
      isDraft: false,
      createdAt: at(readyHoursAgo + 6),
      readyAt: at(readyHoursAgo),
      mergedAt: open ? null : at(Math.max(1, readyHoursAgo - (20 + rand() * 90))),
      additions: Math.round(size * 0.7),
      deletions: Math.round(size * 0.3),
      headRef: `feat/${key}-demo`,
      baseRef: 'develop',
      labels: rand() > 0.8 ? ['risk:db-migration'] : [],
      requestedReviewers: open ? [pick(reviewers)] : [],
      reviews: open && reviewCount === 0 ? [] : reviews,
      checks,
      botSignal: signal,
      taskKey: key,
    })
    tasks.push({
      key,
      title,
      status: open ? 'Code Review' : rand() > 0.9 ? 'Em andamento' : 'Concluída',
      acceptanceCriteria: rand() > 0.1 ? 3 : 0,
      statusHistory: [
        { status: 'Em andamento', at: at(readyHoursAgo + 30) },
        { status: 'Code Review', at: at(readyHoursAgo - rand() * 2) },
      ],
    })
  }

  for (let i = 0; i < 3; i += 1) {
    tasks.push({
      key: `DEMO-${200 + i}`,
      title: `${pick(TITLES)} (${pick(AREAS)})`,
      status: 'Em andamento',
      acceptanceCriteria: i === 0 ? 0 : 2,
      statusHistory: [{ status: 'Em andamento', at: at(60 + i * 40) }],
    })
  }

  return {
    label: 'Exemplo: time fictício de 8 pessoas',
    generatedAt: now,
    pullRequests,
    tasks,
  }
}
