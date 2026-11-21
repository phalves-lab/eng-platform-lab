import { FolderKanban, GitPullRequestArrow, Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ProjectProgress } from '@/components/projects/project-progress'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { PROJECT_STATUS, openPullRequestsLabel, parseProjectTerm } from '@/lib/projects'

export const metadata: Metadata = { title: 'Projetos' }

interface ProjectsProps {
  readonly searchParams: Promise<{ termo?: string | string[] }>
}

export default async function ProjectsPage({ searchParams }: ProjectsProps) {
  const term = parseProjectTerm((await searchParams).termo)
  const projects = await api.projects(term)

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Cada projeto do catálogo com objetivo, épico no Jira, PRs, deploys, sistemas, decisões e riscos. Só leitura."
        actions={
          <form action="/projetos" className="flex w-full gap-2 sm:w-80" role="search">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="termo"
                defaultValue={term}
                placeholder="Nome, épico ou repositório"
                aria-label="Buscar projetos"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        }
      />
      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const status = PROJECT_STATUS[project.status]
            return (
              <Link key={project.id} href={`/projetos/${project.id}`} className="group min-w-0">
                <Card className="h-full gap-4 transition-colors group-hover:border-primary/60">
                  <CardHeader className="gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                      {project.epicKey ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {project.epicKey}
                        </span>
                      ) : null}
                    </div>
                    <CardTitle className="text-base leading-snug">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-3">{project.objective}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProjectProgress
                      epicKey={project.epicKey}
                      epic={project.epic}
                      jira={project.sources.jira}
                    />
                  </CardContent>
                  <CardFooter className="mt-auto flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{project.owner}</span>
                    <span className="flex items-center gap-1">
                      <GitPullRequestArrow className="size-3.5" aria-hidden />
                      {openPullRequestsLabel(project.openPullRequests)}
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={term ? 'Nenhum projeto com esse termo' : 'Nenhum projeto cadastrado'}
          description={
            term
              ? 'Tente o nome do projeto, a chave do épico ou o repositório.'
              : 'Projetos entram em catalog/projects, um arquivo YAML por projeto.'
          }
        />
      )}
    </>
  )
}
