import type {
  ReleaseRun,
  ReleaseSide,
  ReleaseTrackedPull,
  ReleaseWriteStep,
  User,
} from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

/** Lead and admin generate and publish releases; a dev only sees the preview. */
export const canWriteReleases = (role: User['role'] | null) => role === 'lead' || role === 'admin'

/** Every repository of the plan typed exactly, in any order. */
export const confirmationMatches = (typed: readonly string[], expected: readonly string[]) =>
  expected.length > 0 &&
  typed.length === expected.length &&
  expected.every((repo) => typed.map((value) => value.trim()).includes(repo))

const SIDE: Record<ReleaseSide, string> = { front: 'front', back: 'back' }

export const sidesText = (sides: readonly ReleaseSide[]) =>
  sides.map((side) => SIDE[side]).join(' e ')

/** One line per write, in the words the confirmation dialog shows. */
export const describeStep = (step: ReleaseWriteStep): string => {
  switch (step.kind) {
    case 'create-branch':
      return `Criar a branch ${step.branch} em ${step.repo} a partir de ${step.from} (${step.sha.slice(0, 7)})`
    case 'reuse-branch':
      return `Usar a branch ${step.branch}, que já aponta para ${step.sha.slice(0, 7)} em ${step.repo}`
    case 'create-pull':
      return `Abrir a PR ${step.head} → ${step.base} em ${step.repo}`
    case 'update-pull':
      return `Atualizar o corpo da PR #${step.number} em ${step.repo}`
    case 'add-labels':
      return `Aplicar os rótulos ${step.labels.join(', ')} em ${step.repo}`
    case 'add-assignees':
      return `Atribuir ${step.logins.join(', ')} em ${step.repo}`
    case 'link-pulls':
      return `Ligar as PRs de ${step.repos.join(' e ')} uma à outra no corpo`
    case 'create-tag':
      return `Criar a tag ${step.tag} no commit ${step.sha.slice(0, 7)} de ${step.repo}`
    case 'create-release':
      return `Publicar a GitHub Release “${step.name}” em ${step.repo}`
  }
}

export const PULL_STATE_LABEL: Record<ReleaseTrackedPull['state'], string> = {
  open: 'Aberta',
  merged: 'Mergeada',
  closed: 'Fechada',
}

export const PULL_STATE_TONE: Record<ReleaseTrackedPull['state'], BadgeTone> = {
  open: 'info',
  merged: 'success',
  closed: 'secondary',
}

export const SUMMARY_LABEL: Record<ReleaseTrackedPull['summary']['state'], string> = {
  success: 'Resumo pronto',
  failure: 'Resumo falhou',
  pending: 'Resumo rodando',
  none: 'Sem resumo',
}

export const SUMMARY_TONE: Record<ReleaseTrackedPull['summary']['state'], BadgeTone> = {
  success: 'success',
  failure: 'danger',
  pending: 'info',
  none: 'secondary',
}

export const RUN_STATUS_LABEL: Record<ReleaseRun['result']['status'], string> = {
  success: 'Concluída',
  failed: 'Falhou',
  rejected: 'Recusada',
}

export const RUN_STATUS_TONE: Record<ReleaseRun['result']['status'], BadgeTone> = {
  success: 'success',
  failed: 'danger',
  rejected: 'warning',
}

export const RUN_ACTION_LABEL: Record<ReleaseRun['action'], string> = {
  release: 'Gerar release',
  publish: 'Publicar tag',
}

const counted = (count: number, one: string, many: string) => {
  if (count === 0) return null
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

/** "2 aprovações · 1 pedido de ajuste", or a hint when nobody reviewed yet. */
export const approvalsText = (approvals: ReleaseTrackedPull['approvals']) => {
  const parts = [
    counted(approvals.approved.length, 'aprovação', 'aprovações'),
    counted(approvals.changesRequested.length, 'pedido de ajuste', 'pedidos de ajuste'),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Sem review'
}

/** A merged release PR that has no tag yet is the only one that can be published. */
export const canPublish = (pull: ReleaseTrackedPull) => pull.state === 'merged' && !pull.published

/** Message for a failed call to the release route handlers. */
export const errorMessage = (status: number, body: unknown) => {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  if (status === 429) return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.'
  return 'Não foi possível falar com o portal agora. Tente de novo.'
}

/** One-line summary of what a run did, for the history table. */
export const runSummary = (run: ReleaseRun) => {
  const { result } = run
  if (result.status === 'rejected') return result.error ?? 'Execução recusada.'
  if (result.release) return `Tag ${result.release.tag} publicada`
  const created = result.pulls.filter((pull) => pull.action === 'created').length
  const updated = result.pulls.length - created
  const parts = [
    created ? `${created} PR(s) aberta(s)` : null,
    updated ? `${updated} PR(s) atualizada(s)` : null,
    result.branches.length ? `${result.branches.length} branch(es) criada(s)` : null,
  ].filter(Boolean)
  const done = parts.length ? parts.join(', ') : 'Nada escrito'
  return result.error ? `${done}. Erro: ${result.error}` : done
}
