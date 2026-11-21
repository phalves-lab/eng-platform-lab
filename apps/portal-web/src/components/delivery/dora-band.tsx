import type { DoraBand } from '@lab/contracts'
import { ToneBadge } from '@/components/status-badge'
import { bandBadge } from '@/lib/dora'

export function DoraBandBadge({ band }: { readonly band: DoraBand | null }) {
  const { label, tone } = bandBadge(band)
  return <ToneBadge tone={tone}>{label}</ToneBadge>
}
