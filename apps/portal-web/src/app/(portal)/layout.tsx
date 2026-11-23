import { redirect } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { screenForStatus } from '@/lib/access'
import { api, ApiError } from '@/lib/api'
import { readAuthConfig } from '@/lib/auth-config'

export const dynamic = 'force-dynamic'

const LAYOUT_VARS = {
  '--sidebar-width': 'calc(var(--spacing) * 68)',
  '--header-height': 'calc(var(--spacing) * 12)',
} as CSSProperties

const currentUser = async () => {
  try {
    return await api.me()
  } catch (error) {
    const screen = error instanceof ApiError ? screenForStatus(error.status) : null
    if (screen) redirect(screen)
    throw error
  }
}

export default async function PortalLayout({ children }: { readonly children: ReactNode }) {
  const user = await currentUser()
  const canSignOut = readAuthConfig(process.env).mode === 'entra'
  return (
    <SidebarProvider style={LAYOUT_VARS}>
      <AppSidebar variant="inset" user={user} canSignOut={canSignOut} />
      <SidebarInset>
        <SiteHeader role={user.role} />
        <div className="@container/main flex flex-1 flex-col p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl space-y-8">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
