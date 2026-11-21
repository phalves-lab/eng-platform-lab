import type { CSSProperties, ReactNode } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { api } from '@/lib/api'

export const dynamic = 'force-dynamic'

const LAYOUT_VARS = {
  '--sidebar-width': 'calc(var(--spacing) * 68)',
  '--header-height': 'calc(var(--spacing) * 12)',
} as CSSProperties

export default async function PortalLayout({ children }: { readonly children: ReactNode }) {
  const user = await api.me()
  return (
    <SidebarProvider style={LAYOUT_VARS}>
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl space-y-8">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
