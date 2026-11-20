import { buildAlerts, buildMetrics, buildQueue, type QueueItem } from './metrics.js'
import type { Dataset } from './types.js'

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

const fixed = (value: number | null, digits = 1) =>
  value === null ? 'sem dados' : value.toFixed(digits).replace('.', ',')

const withUnit = (value: number | null, unit: string, digits = 1) =>
  value === null ? 'sem dados' : `${fixed(value, digits)} ${unit}`

const SIGNAL_TEXT = { ajustes: 'Ajustes', gate: 'Pendências', pronto: 'Pronto' } as const
const LEVEL_TEXT = { ok: 'No prazo', atencao: 'Atenção', atrasado: 'Atrasado' } as const
const CHECKS_TEXT: Record<string, string> = {
  SUCCESS: 'Verde',
  FAILURE: 'Vermelho',
  ERROR: 'Vermelho',
  PENDING: 'Rodando',
  EXPECTED: 'Rodando',
}

const queueRow = (item: QueueItem, position: number) => {
  const { pr } = item
  const signal = pr.botSignal ? SIGNAL_TEXT[pr.botSignal] : 'Sem comentário'
  const risks = pr.labels.filter((l) => l.startsWith('risk:')).join(', ') || 'nenhum'
  return `<tr class="level-${item.level}">
    <td>${position}</td>
    <td><a href="${escape(pr.url)}">#${pr.number}</a> ${escape(pr.title)}</td>
    <td>${escape(pr.taskKey ?? 'sem task')}${item.task ? ` <span class="muted">${escape(item.task.status)}</span>` : ''}</td>
    <td>${escape(pr.author)}</td>
    <td>${escape(pr.requestedReviewers.join(', ') || 'ninguém pedido')}</td>
    <td>${formatDate(item.enteredAt)} <span class="muted">${item.enteredFrom === 'jira' ? 'board' : 'PR'}</span></td>
    <td><span class="pill pill-${item.level}">${LEVEL_TEXT[item.level]}</span> ${fixed(item.ageBusinessDays)} d</td>
    <td>${CHECKS_TEXT[pr.checks ?? ''] ?? 'Sem checks'}</td>
    <td>${signal}</td>
    <td>${escape(risks)}</td>
    <td>${pr.additions + pr.deletions}</td>
  </tr>`
}

const section = (dataset: Dataset, id: string) => {
  const now = dataset.generatedAt
  const queue = buildQueue(dataset.pullRequests, dataset.tasks, now)
  const alerts = buildAlerts(dataset.pullRequests, dataset.tasks, now)
  const metrics = buildMetrics(dataset.pullRequests, now)

  const queueTable = queue.length
    ? `<table><thead><tr><th>#</th><th>PR</th><th>Task</th><th>Autor</th><th>Revisores pedidos</th><th>Entrou em review</th><th>Tempo na fila</th><th>Checks</th><th>Sinal do bot</th><th>Risco</th><th>Linhas</th></tr></thead><tbody>${queue.map((item, i) => queueRow(item, i + 1)).join('')}</tbody></table>`
    : '<p class="empty">Nenhum PR aguardando review.</p>'

  const alertList = alerts.length
    ? `<ul class="alerts">${alerts
        .map(
          (a) =>
            `<li class="alert-${a.severity}"><strong>${escape(a.kind)}</strong> ${escape(a.message)}${a.url ? ` <a href="${escape(a.url)}">abrir</a>` : ''}</li>`,
        )
        .join('')}</ul>`
    : '<p class="empty">Nenhum alerta.</p>'

  const reviewersTable = metrics.reviewers.length
    ? `<table><thead><tr><th>Pessoa</th><th>Reviews</th><th>PRs revisados</th><th>Comentários</th><th>Comentários por review</th></tr></thead><tbody>${metrics.reviewers
        .map(
          (r) =>
            `<tr><td>${escape(r.reviewer)}</td><td>${r.reviews}</td><td>${r.pullRequests}</td><td>${r.comments}</td><td>${fixed(r.comments / r.reviews)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">Nenhuma review humana na janela. Com um revisor só, o laboratório roda com 0 aprovações obrigatórias.</p>'

  const pairsList = metrics.pairs.length
    ? `<ul class="pairs">${metrics.pairs
        .slice(0, 10)
        .map((p) => `<li>${escape(p.reviewer)} revisou ${escape(p.author)}: ${p.count}</li>`)
        .join('')}</ul>`
    : ''

  const cards = [
    ['PRs mergeados', String(metrics.merged)],
    ['Até a 1ª review (mediana)', withUnit(metrics.medianHoursToFirstReview, 'h')],
    ['Até o merge (mediana)', withUnit(metrics.medianBusinessDaysToMerge, 'dias úteis')],
    ['Tamanho do PR (mediana)', withUnit(metrics.medianSize, 'linhas', 0)],
    ['Mergeados com check vermelho', String(metrics.mergedWithFailingChecks)],
    [
      'Sinal do bot',
      `${metrics.signals.pronto} pronto, ${metrics.signals.gate} pendências, ${metrics.signals.ajustes} ajustes`,
    ],
  ]
    .map(
      ([label, value]) => `<div class="card"><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join('')

  return `<section id="${id}" class="dataset">
    <p class="meta">${escape(dataset.label)}. Atualizado em ${formatDate(now)}.</p>
    <h2>Fila de code review</h2>
    <p class="help">Ordem de entrada em code review: transição no board do Jira quando existe; senão, quando o PR ficou pronto. Atenção acima de 1 dia útil, atrasado acima de 3.</p>
    ${queueTable}
    <h2>Alertas</h2>
    ${alertList}
    <h2>Métricas dos últimos ${metrics.windowDays} dias</h2>
    <div class="cards">${cards}</div>
    <h2>Reviews e reconhecimento</h2>
    <p class="help">Carga de review por pessoa, para equilibrar e reconhecer quem segura o processo. Não é meta individual: olhe junto com os comentários por review.</p>
    ${reviewersTable}
    ${pairsList}
  </section>`
}

export const renderPage = (
  datasets: { id: string; title: string; dataset: Dataset }[],
): string => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel de review</title>
<style>
  :root { --bg:#f7f7f5; --fg:#1d1d1b; --muted:#6b6b66; --card:#ffffff; --line:#e3e2dd; --ok:#2f7d4a; --warn:#a86b00; --late:#b3261e; --accent:#2a5bd7; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141413; --fg:#ecebe6; --muted:#a3a29c; --card:#1e1e1c; --line:#33322f; --ok:#5fbf7f; --warn:#e0a63a; --late:#ef6b62; --accent:#7ea2ff; } }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--fg); }
  header { padding: 24px 16px 8px; max-width: 1280px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { font-size: 17px; margin: 28px 0 8px; }
  main { max-width: 1280px; margin: 0 auto; padding: 0 16px 48px; }
  .tabs { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .tabs button { border:1px solid var(--line); background:var(--card); color:var(--fg); padding:6px 12px; border-radius:6px; cursor:pointer; font:inherit; }
  .tabs button[aria-selected="true"] { border-color: var(--accent); color: var(--accent); }
  .dataset { display:none; }
  .dataset.active { display:block; }
  .meta, .help, .muted { color: var(--muted); }
  .help { margin-top: 0; font-size: 14px; }
  .muted { font-size: 12px; }
  table { width:100%; border-collapse: collapse; background: var(--card); border:1px solid var(--line); display:block; overflow-x:auto; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align: top; font-size: 14px; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); white-space: nowrap; }
  a { color: var(--accent); }
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:12px; border:1px solid currentColor; }
  .pill-ok { color: var(--ok); } .pill-atencao { color: var(--warn); } .pill-atrasado { color: var(--late); }
  tr.level-atrasado td:first-child { box-shadow: inset 3px 0 var(--late); }
  tr.level-atencao td:first-child { box-shadow: inset 3px 0 var(--warn); }
  .alerts { list-style:none; padding:0; margin:0; display:grid; gap:6px; }
  .alerts li { background: var(--card); border:1px solid var(--line); border-left:4px solid var(--warn); padding:8px 12px; border-radius:4px; }
  .alerts li.alert-alta { border-left-color: var(--late); }
  .cards { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:12px; }
  .card span { display:block; color:var(--muted); font-size:13px; }
  .card strong { font-size:18px; }
  .empty { background: var(--card); border:1px dashed var(--line); padding:12px; border-radius:6px; color: var(--muted); }
  .pairs { color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>Painel de review</h1>
  <p class="meta">Fila de code review, alertas e métricas da esteira. Dados lidos só com permissão de leitura.</p>
  <div class="tabs" role="tablist">
    ${datasets.map((d, i) => `<button role="tab" data-target="${d.id}" aria-selected="${i === 0}">${escape(d.title)}</button>`).join('')}
  </div>
</header>
<main>
${datasets.map((d, i) => section(d.dataset, d.id).replace('class="dataset"', i === 0 ? 'class="dataset active"' : 'class="dataset"')).join('\n')}
</main>
<script>
  document.querySelectorAll('.tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === button)))
      document.querySelectorAll('.dataset').forEach((s) => s.classList.toggle('active', s.id === button.dataset.target))
    })
  })
</script>
</body>
</html>
`
