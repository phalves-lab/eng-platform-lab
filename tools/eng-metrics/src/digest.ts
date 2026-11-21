import type { PanelDataset } from './contract.js'

const TOP_ALERTS = 3

const decimal = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso))

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`

/** Reviews pedidas e ainda não feitas, por pessoa, da maior carga para a menor. */
export const pendingReviews = (dataset: PanelDataset): [string, number][] => {
  const pending = new Map<string, number>()
  for (const row of dataset.queue) {
    for (const reviewer of row.requestedReviewers) {
      if (row.reviewedBy.includes(reviewer)) continue
      pending.set(reviewer, (pending.get(reviewer) ?? 0) + 1)
    }
  }
  return [...pending.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const queueLines = (dataset: PanelDataset): string[] => {
  const { queue } = dataset
  if (!queue.length) return ['Fila de review vazia.']
  const late = queue.filter((row) => row.level === 'atrasado').length
  const attention = queue.filter((row) => row.level === 'atencao').length
  const withoutReview = queue.filter((row) => !row.hasHumanReview).length
  const lines = [
    `Fila de review: ${plural(queue.length, 'PR', 'PRs')} (${plural(late, 'atrasado', 'atrasados')}, ${attention} em atenção, ${withoutReview} sem nenhuma review).`,
  ]
  const first = queue[0]
  if (first)
    lines.push(
      `Primeiro da fila: #${first.number} ${first.title}, de ${first.author}, há ${decimal(first.ageBusinessDays)} dias úteis.`,
    )
  const pending = pendingReviews(dataset)
  if (pending.length)
    lines.push(
      `Reviews pendentes por pessoa: ${pending.map(([login, count]) => `${login} ${count}`).join(', ')}.`,
    )
  return lines
}

const alertLines = (dataset: PanelDataset): string[] => {
  const high = dataset.alerts.filter((alert) => alert.severity === 'alta')
  const medium = dataset.alerts.length - high.length
  if (!dataset.alerts.length) return ['Nenhum alerta.']
  return [
    `Alertas: ${high.length} de severidade alta e ${medium} média.`,
    ...high.slice(0, TOP_ALERTS).map((alert) => `- ${alert.kind}: ${alert.message}`),
  ]
}

const metricLine = (dataset: PanelDataset): string => {
  const { merged, medianHoursToFirstReview, windowDays } = dataset.metrics
  const firstReview =
    medianHoursToFirstReview === null
      ? 'sem review humana na janela'
      : `${decimal(medianHoursToFirstReview)} h até a 1ª review (mediana)`
  return `Últimos ${windowDays} dias: ${plural(merged, 'PR mergeado', 'PRs mergeados')}, ${firstReview}.`
}

/** Texto curto para canal do time, montado só com o que o painel já calculou. */
export const buildDigest = (dataset: PanelDataset, panelUrl: string): string =>
  [
    `Resumo da esteira, ${dateLabel(dataset.generatedAt)} (${dataset.label})`,
    '',
    ...queueLines(dataset),
    '',
    ...alertLines(dataset),
    '',
    metricLine(dataset),
    `Painel: ${panelUrl}`,
  ].join('\n')

/**
 * Envia o resumo para um webhook de entrada (formato `{ text }`, aceito pelo Slack e pelo
 * Google Chat). Só roda quando o secret do webhook foi cadastrado.
 */
export const postDigest = async (
  webhookUrl: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> => {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(`O webhook do resumo respondeu ${response.status}.`)
}
