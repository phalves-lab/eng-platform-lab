import type { TeamWorkResponse } from '@lab/contracts'
import { ToneBadge } from '@/components/status-badge'
import { describeLoad } from '@/lib/work'

export function TeamLoad({ members }: { readonly members: TeamWorkResponse['members'] }) {
  return (
    <ul className="divide-y">
      {members.map((member) => {
        const load = describeLoad(member)
        return (
          <li key={member.login} className="flex flex-col gap-1 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{member.name}</span>
              {member.role === 'lead' ? <ToneBadge tone="info">Líder</ToneBadge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {load.length ? load.join(' · ') : 'Sem conta do Jira nem do GitHub no catálogo'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
