'use client'

import { usePathname } from 'next/navigation'
import { CommandMenu } from '@/components/command-menu'
import { activeItem } from '@/components/navigation'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function SiteHeader() {
  const pathname = usePathname()
  const title = activeItem(pathname)?.title ?? 'Portal de engenharia'
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" aria-label="Abrir ou recolher o menu" />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <h1 className="truncate text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <CommandMenu />
        </div>
      </div>
    </header>
  )
}
